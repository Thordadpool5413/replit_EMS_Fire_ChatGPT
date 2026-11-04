import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const interactionViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
];
const testCorrectionRecordId = 'browser-check-2026';
const specialistAndSystemViews = [
  {
    group: 'Specialist tools',
    tab: 'Clinical & competitive',
    heading: 'Clinical & competitive knowledge hub',
    interactions: [
      { label: 'Safety recalls & talk tracks', expectedText: 'FDA MAUDE recalls, end-of-life status' },
      { label: 'Cooperative purchasing vehicles', expectedText: 'Pre-competed cooperative purchasing contracts & vehicles' },
      { label: 'Quality scorecard & fee schedules', expectedText: 'NEMSQA, AHA & CARES clinical quality scorecard' },
    ],
  },
  {
    group: 'Specialist tools',
    tab: 'Medicare & public health',
    heading: 'Public healthcare, CMS claims & EMS outcomes engine',
    interactions: [
      { label: '4. Federal AFG', expectedText: 'Playbook 4: The FEMA Assistance to Firefighters Grant (AFG) Fast-Track' },
      { label: '6. ET3 & MIH', expectedText: 'Playbook 6: CMS ET3, Hospital Handoff Reduction & Community Paramedicine' },
    ],
  },
  {
    group: 'Specialist tools',
    tab: 'Equipment viewer',
    heading: '3D Ambulance, Fire Apparatus',
    interactions: [
      { label: 'Rescue Pumper', expectedText: 'Class A Rescue Pumper' },
      { label: 'ALS Ambulance', expectedText: 'Type III Modular ALS Transport Unit' },
      { label: 'ALS Patient Module & Mount', expectedText: 'ALS Patient Module & Mount • SAE J3043 Crash-Rated X Series' },
    ],
  },
  {
    group: 'Specialist tools',
    tab: 'Federal sources',
    heading: 'Nationwide Federal Registry',
    interactions: [
      { label: '2. Live OpenFEMA & Co-Op Horizon', expectedText: 'Live OpenFEMA & Co-Op Horizon' },
      { label: '4. Fleet Lifecycle & TCO Ledger', expectedText: 'Agency Fleet Lifecycle & 5-Year TCO Telemetry' },
      { label: '3. NEMSIS v3.5 & HIPAA Safe Harbor', expectedText: 'REGULATORY & CLINICAL STANDARDS REFERENCE' },
    ],
  },
  {
    group: 'Data & system',
    tab: 'Data health & sync',
    heading: 'Data Health, Cloud Synchronization',
    interactions: [
      { label: 'Flagged Mismatches', selectedClass: 'bg-white' },
      { label: 'Invalid Checksums', selectedClass: 'bg-white' },
      { label: 'Public Baseline', selectedClass: 'bg-white' },
    ],
    conflictTestId: 'button-inspect-conflict-candidate-chicago-mock',
  },
  {
    group: 'Data & system',
    tab: 'Backup & restore',
    heading: 'Local Backup & State Archive Center',
    interactions: [
      { label: 'Audit Log Stream', expectedText: 'CLOUD AUDIT STREAM' },
      { label: 'Versioned State Snapshots', expectedText: 'SHA-256:' },
    ],
  },
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

async function openAgencyProfile(cdp, providerCategory = 'all') {
  const isMobile = await evaluate(cdp, 'innerWidth < 768');
  if (isMobile) {
    const searchOpened = await evaluate(cdp, `(() => {
      const button = document.querySelector('[data-testid="button-mobile-provider-search"]');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) return false;
      button.click();
      return true;
    })()`);
    assert(searchOpened, 'The mobile provider search button is not reachable');
    await waitFor(
      cdp,
      `Boolean(document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]'))`,
      'the mobile provider search drawer',
    );
    const searchClosed = await evaluate(cdp, `(() => {
      const button = document.querySelector('button[aria-label="Close provider search"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(searchClosed, 'The mobile provider search drawer has no reachable close action');
    await waitFor(
      cdp,
      `!document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]')`,
      'the mobile provider search drawer to close',
    );
  }
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
  if (providerCategory !== 'all') {
    const selectedCategory = await evaluate(cdp, `(() => {
      const expected = ${JSON.stringify(providerCategory)};
      const visible = (button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return rect.width > 0 && rect.height > 0 &&
          style.visibility !== 'hidden' && style.display !== 'none' &&
          rect.right > 0 && rect.left < innerWidth &&
          rect.bottom > 0 && rect.top < innerHeight;
      };
      const candidate = [...document.querySelectorAll('button')]
        .filter(visible)
        .find((button) => new RegExp('^' + expected + '\\\\s*\\\\(', 'i').test(button.innerText.trim()));
      const fallback = [...(document.querySelector('[aria-label="Provider Discipline Filter"]')?.querySelectorAll('button') ?? [])]
        .find((button) => button.innerText.trim().toLowerCase() === expected);
      const button = candidate || fallback;
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(selectedCategory, `Could not select the ${providerCategory} provider filter`);
    const expectedProviderLabel = providerCategory === 'fire' ? 'Fire Department' : 'EMS Provider';
    await waitFor(
      cdp,
      `document.body.innerText.includes(${JSON.stringify(expectedProviderLabel)})`,
      `the ${providerCategory} agency directory`,
    );
  }
  const viewportWidth = await evaluate(cdp, 'innerWidth');
  if (viewportWidth === 390 || viewportWidth === 1280) {
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      `/tmp/ems-agency-directory-${providerCategory}-${viewportWidth}.png`,
      Buffer.from(screenshot.result.data, 'base64'),
    );
  }
  const estimateDisclosureOpened = await evaluate(cdp, `(() => {
    const details = [...document.querySelectorAll('[data-testid="planning-value-explanation"]')]
      .find((item) => item.getBoundingClientRect().width > 0);
    if (!details) return false;
    details.scrollIntoView({ block: 'center' });
    details.querySelector('summary')?.click();
    return details.open;
  })()`);
  assert(estimateDisclosureOpened, `The ${providerCategory} directory is missing estimate details`);
  const estimateDetailsVisible = await evaluate(cdp, `(() => {
    const details = document.querySelector('[data-testid="planning-value-explanation"]');
    const text = details?.innerText || '';
    return text.includes('Formula:') || text.includes('method, inputs, source period');
  })()`);
  assert(estimateDetailsVisible, `The ${providerCategory} estimate does not explain its inputs or missing method`);
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
  if (providerCategory !== 'all') {
    const providerTypeVisible = await evaluate(
      cdp,
      `document.querySelector('main.profile-workspace')?.innerText.includes(${JSON.stringify(
        providerCategory === 'fire' ? 'Fire Department' : 'EMS Provider',
      )}) ?? false`,
    );
    assert(providerTypeVisible, `The ${providerCategory} profile type was not visible after opening`);
  }
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
  const profileSummaryChecks = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const operations = profile?.querySelector('[aria-label="Agency operations summary"]');
    const lead = operations?.querySelector('.profile-operations-lead')?.innerText.trim() || '';
    const sourceLinks = [...(profile?.querySelectorAll('a[href]') ?? [])]
      .filter((link) => {
        try {
          return new URL(link.href).protocol === 'https:';
        } catch {
          return false;
        }
      });
    const actions = profile?.querySelector('[data-testid="profile-primary-actions"]');
    const isFire = ${JSON.stringify(providerCategory)} === 'fire';
    return {
      operationsSummary: Boolean(operations),
      operationsLead: lead,
      correctOperations: isFire
        ? /\\bstations\\b/i.test(lead) && /fire engines/i.test(lead)
        : /\\bambulances\\b/i.test(lead),
      sourceReferencesPanel: Boolean(profile?.querySelector('[aria-label="Available source references"]')),
      sourceLinks: sourceLinks.length,
      sourceLinksAreHttps: sourceLinks.every((link) => new URL(link.href).protocol === 'https:'),
      inspectSourcesAction: Boolean(actions?.querySelector('[aria-label="Inspect agency sources"]')),
      prepareMeetingAction: Boolean(actions?.querySelector('[aria-label="Prepare for meeting"]')),
      addToRouteAction: Boolean(actions?.querySelector('[aria-label="Add agency to route"], [aria-label="Remove agency from today\\'s route"]')),
      saveAgencyAction: Boolean(actions?.querySelector('[aria-label="Save agency to My Work"], [aria-label="Remove agency from saved work"]')),
    };
  })()`);
  assert(
    profileSummaryChecks.operationsSummary && profileSummaryChecks.correctOperations,
    `${providerCategory} profile has the wrong primary operations summary: ${JSON.stringify(profileSummaryChecks)}`,
  );
  assert(
    profileSummaryChecks.sourceReferencesPanel &&
      profileSummaryChecks.sourceLinks > 0 &&
      profileSummaryChecks.sourceLinksAreHttps,
    `${providerCategory} profile has no usable HTTPS source links: ${JSON.stringify(profileSummaryChecks)}`,
  );
  for (const action of ['inspectSourcesAction', 'prepareMeetingAction', 'addToRouteAction', 'saveAgencyAction']) {
    assert(profileSummaryChecks[action], `${providerCategory} profile is missing the ${action} action`);
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
  const openedCorrectionForm = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="button-add-agency-source-correction"]');
    button?.scrollIntoView({ block: 'center' });
    button?.click();
    return Boolean(button);
  })()`);
  assert(openedCorrectionForm, 'The agency source workspace is missing its correction action');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-correction"]'))`,
    'the agency correction form',
  );
  const sourceRecordsBeforeCorrection = await evaluate(
    cdp,
    `localStorage.getItem('ems_territory_agency_source_records_v1')`,
  );
  const correctionFormChecks = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    return {
      profileField: Boolean(form?.querySelector('input[placeholder="Name the specific field, e.g. Annual call volume"]')),
      previousValue: Boolean(form?.querySelector('input[placeholder="Value currently shown in the profile"]')),
      newValue: [...(form?.querySelectorAll('input') ?? [])].some((input) =>
        input.placeholder === 'Enter the exact value',
      ),
      sourceAndPeriod: form?.innerText.includes('Source name') && form.innerText.includes('Reporting period'),
      geographyAndBasis: form?.innerText.includes('Geographic scope') && form.innerText.includes('Value basis'),
    };
  })()`);
  for (const [field, available] of Object.entries(correctionFormChecks)) {
    assert(available, `The agency correction form is missing ${field}`);
  }
  const submittedCorrection = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    if (!form) return false;
    const setValue = (selector, value) => {
      const input = form.querySelector(selector);
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const fieldsSet = [
      setValue('input[placeholder="Name the specific field, e.g. Annual call volume"]', 'Annual emergency call volume'),
      setValue('input[placeholder="Value currently shown in the profile"]', '1,200'),
      setValue('input[placeholder="Enter the exact value"]', '1,350'),
      setValue('input[placeholder="Agency report, contract, account disclosure"]', 'Correction UI check'),
      setValue('input[placeholder="Document number, page, asset ID..."]', ${JSON.stringify(testCorrectionRecordId)}),
      setValue('input[placeholder="e.g. FY2025 or Jan–Dec 2025"]', 'FY2026'),
    ].every(Boolean);
    if (!fieldsSet) return false;
    form.querySelector('[data-testid="button-save-agency-source-fact"]')?.click();
    return true;
  })()`);
  assert(submittedCorrection, 'Could not submit the agency correction form');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid^="source-fact-correction-history-"]'))`,
    'the previous agency value to appear in correction history',
  );
  const correctionPersisted = await evaluate(cdp, `(() => {
    const saved = JSON.parse(localStorage.getItem('ems_territory_agency_source_records_v1') || '{}');
    return Object.values(saved).some((agency) =>
      agency.sourceFacts?.some((fact) =>
        fact.value === '1,350' &&
        fact.reportingPeriod === 'FY2026' &&
        fact.correction?.previousValue === '1,200' &&
        fact.sourceRecordId === ${JSON.stringify(testCorrectionRecordId)},
      ),
    );
  })()`);
  assert(correctionPersisted, 'The corrected and previous values were not saved locally');
  const sourceRecordsRestored = await evaluate(cdp, `(() => {
    const key = 'ems_territory_agency_source_records_v1';
    const original = ${JSON.stringify(sourceRecordsBeforeCorrection)};
    if (original === null) localStorage.removeItem(key);
    else localStorage.setItem(key, original);
    return localStorage.getItem(key) === original;
  })()`);
  assert(sourceRecordsRestored, 'The test-only source correction did not restore the original browser records');
  const testCorrectionRemoved = await evaluate(cdp, `(() => {
    const saved = JSON.parse(localStorage.getItem('ems_territory_agency_source_records_v1') || '{}');
    return !Object.values(saved).some((agency) =>
      agency.sourceFacts?.some((fact) => fact.sourceRecordId === ${JSON.stringify(testCorrectionRecordId)}),
    );
  })()`);
  assert(testCorrectionRemoved, 'The test-only source correction remains in browser storage');
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
  await openAgencyProfile(cdp, 'ems');
  if (viewport.width === 390 || viewport.width === 1280) {
    await evaluate(cdp, `(() => {
      const mobileSelect = document.querySelector('[data-testid="select-profile-section-mobile"]');
      if (mobileSelect) {
        mobileSelect.value = 'overview';
        mobileSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const overview = [...document.querySelectorAll('button')]
          .find((button) => button.innerText.trim().startsWith('1. Overview'));
        overview?.click();
      }
      document.querySelector('.provider-profile-overlay')?.scrollTo({ top: 0 });
    })()`);
    await waitFor(
      cdp,
      `document.querySelector('main.profile-workspace')?.innerText.includes('Operational intelligence')`,
      'the profile overview for visual capture',
    );
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      `/tmp/ems-agency-ems-profile-${viewport.width}.png`,
      Buffer.from(screenshot.result.data, 'base64'),
    );
  }
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
    const primaryActions = document.querySelector('[data-testid="profile-primary-actions"]');
    const actionArea = primaryActions || dock;
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.right > 0 && rect.left < innerWidth &&
        rect.bottom > 0 && rect.top < innerHeight;
    };
    const reachable = (selector) => {
      const element = actionArea?.querySelector(selector);
      if (visible(element)) return true;
      return Boolean(
        element &&
        primaryActions &&
        primaryActions.clientWidth > 0 &&
        primaryActions.scrollWidth > primaryActions.clientWidth,
      );
    };
    return {
      mobile: innerWidth < 768,
      sectionPicker: visible(select),
      routeAction: reachable(
        '[aria-label="Add agency to route"], [aria-label="Remove agency from today\\'s route"]',
      ),
      saveAction: reachable(
        '[aria-label="Save agency to My Work"], [aria-label="Remove agency from saved work"]',
      ),
      meetingAction: reachable('[aria-label="Prepare for meeting"]'),
      sourceAction: reachable('[aria-label="Inspect agency sources"]'),
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
    const actionArea = document.querySelector('[data-testid="profile-primary-actions"]');
    const button = actionArea?.querySelector('[aria-label="Prepare for meeting"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) return false;
    button.click();
    return true;
  })()`);
  assert(meetingActionReached, `Prepare for meeting was not reachable at ${viewport.width}px`);
  try {
    await waitFor(
      cdp,
      `(() => {
        const section = document.querySelector('[aria-label="Prepare for Meeting Intelligence Workspace"]');
        const nav = document.querySelector('.pi-mobile-nav');
        if (!section) return false;
        const rect = section.getBoundingClientRect();
        const navRect = nav?.getBoundingClientRect();
        const navTop = navRect && navRect.height > 0 && getComputedStyle(nav).display !== 'none'
          ? navRect.top
          : innerHeight;
        return rect.top < navTop && rect.bottom > 0;
      })()`,
      `the meeting briefing at ${viewport.width}px`,
    );
  } catch (error) {
    const meetingState = await evaluate(cdp, `(() => {
      const section = document.querySelector('[aria-label="Prepare for Meeting Intelligence Workspace"]');
      const profile = document.querySelector('main.profile-workspace');
      const overlay = document.querySelector('.provider-profile-overlay');
      const rect = section?.getBoundingClientRect();
      return JSON.stringify({
        sectionFound: Boolean(section),
        sectionRect: rect && { top: rect.top, bottom: rect.bottom },
        profileScroll: profile?.scrollTop,
        overlayScroll: overlay?.scrollTop,
        viewport: { width: innerWidth, height: innerHeight },
        text: document.body.innerText.slice(-500),
      });
    })()`);
    throw new Error(`${error.message}. Meeting state: ${meetingState}`);
  }
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  if (viewport.mobile) {
    const dockState = await evaluate(cdp, `(() => {
      const dock = document.querySelector('.profile-action-dock');
      const nav = document.querySelector('.pi-mobile-nav');
      if (!dock || !nav) return null;
      const dockRect = dock.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      return {
        position: getComputedStyle(dock).position,
        top: dockRect.top,
        bottom: dockRect.bottom,
        navTop: navRect.top,
        visible: dockRect.height > 0 && dockRect.top >= 0 && dockRect.bottom <= navRect.top,
      };
    })()`);
    assert(
      dockState?.position === 'sticky' && dockState.visible,
      `Mobile agency actions are not sticky and clear of bottom navigation at ${viewport.width}px: ${JSON.stringify(dockState)}`,
    );
  }

  const drawerButton = await evaluate(cdp, `(() => {
    const actionArea = document.querySelector('[data-testid="profile-primary-actions"]');
    const button = actionArea?.querySelector('[aria-label="Inspect agency sources"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
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

async function checkFireProfileAtViewport(cdp, viewport) {
  console.log(`Checking Fire profile at ${viewport.width}px viewport...`);
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
  await openAgencyProfile(cdp, 'fire');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  const operationsSummary = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const summary = profile?.querySelector('[aria-label="Agency operations summary"]');
    if (!summary) return null;
    summary.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = summary.getBoundingClientRect();
    const lead = summary.querySelector('.profile-operations-lead')?.innerText.trim() || '';
    return {
      visible: bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.bottom > 0 && bounds.top < innerHeight,
      fits: summary.scrollWidth <= summary.clientWidth + 1,
      fireMetrics: /\\bstations\\b/i.test(lead) && /fire engines/i.test(lead),
      lead,
    };
  })()`);
  assert(
    operationsSummary?.visible && operationsSummary.fits && operationsSummary.fireMetrics,
    `Fire operations summary is not usable at ${viewport.width}px: ${JSON.stringify(operationsSummary)}`,
  );
  const fireActions = await evaluate(cdp, `(() => {
    const area = document.querySelector('[data-testid="profile-primary-actions"]');
    if (!area) return null;
    const selectors = {
      meeting: '[aria-label="Prepare for meeting"]',
      sources: '[aria-label="Inspect agency sources"]',
      route: '[aria-label="Add agency to route"], [aria-label="Remove agency from today\\'s route"]',
      saved: '[aria-label="Save agency to My Work"], [aria-label="Remove agency from saved work"]',
    };
    const results = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const button = area.querySelector(selector);
      if (!button) {
        results[name] = false;
        continue;
      }
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const bounds = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      results[name] = !button.disabled && bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.bottom > 0 && bounds.top < innerHeight &&
        style.visibility !== 'hidden' && style.display !== 'none';
    }
    return results;
  })()`);
  for (const [action, usable] of Object.entries(fireActions ?? {})) {
    assert(usable, `Fire ${action} profile action is not reachable at ${viewport.width}px`);
  }
  assert(
    fireActions && Object.keys(fireActions).length === 4,
    `Fire profile actions are incomplete at ${viewport.width}px: ${JSON.stringify(fireActions)}`,
  );
  const openedSourceDrawer = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="profile-primary-actions"] [aria-label="Inspect agency sources"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) return false;
    button.click();
    return true;
  })()`);
  assert(openedSourceDrawer, `Fire source inspection was not reachable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]'))`,
    `the Fire source inspection drawer at ${viewport.width}px`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'drawer');
  const fireSourceDrawer = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    if (!drawer) return null;
    const bounds = drawer.getBoundingClientRect();
    return {
      withinViewport: bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1,
      hasUsableClose: [...drawer.querySelectorAll('button')].some((button) =>
        button.innerText.trim() === 'Close' && !button.disabled &&
        button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0,
      ),
    };
  })()`);
  assert(
    fireSourceDrawer?.withinViewport && fireSourceDrawer.hasUsableClose,
    `Fire source drawer is not usable at ${viewport.width}px: ${JSON.stringify(fireSourceDrawer)}`,
  );
  const fireSourceLinks = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    return [...(drawer?.querySelectorAll('a[href]') ?? [])]
      .filter((link) => {
        try {
          return new URL(link.href).protocol === 'https:';
        } catch {
          return false;
        }
      }).length;
  })()`);
  assert(fireSourceLinks > 0, `Fire source drawer has no HTTPS links at ${viewport.width}px`);
  const closedSourceDrawer = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const close = [...(drawer?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.trim() === 'Close');
    if (!close) return false;
    close.click();
    return true;
  })()`);
  assert(closedSourceDrawer, `The Fire source drawer could not be closed at ${viewport.width}px`);
  await waitFor(
    cdp,
    `!document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]')`,
    `the Fire source inspection drawer to close at ${viewport.width}px`,
  );
  console.log(`✓ ${viewport.width}px: Fire operations summary, profile actions, source drawer, and overflow`);
}

async function checkTerritoryAtViewport(cdp, viewport) {
  console.log(`Checking Territory at ${viewport.width}px viewport...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      document.body.innerText.includes('Interactive U.S. Territory Map')`,
    `the app at ${viewport.width}px`,
    60_000,
  );
  await clickVisibleButton(cdp, 'Territory', 'Territory navigation');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.territory-explorer-screen'))`,
    'the Territory directory',
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#home-state-picker'))`,
    'the state selector',
  );
  await evaluate(cdp, 'document.documentElement.classList.add("dark")');
  const selectedState = await evaluate(cdp, `(() => {
    const select = document.querySelector('#home-state-picker');
    if (!select) return false;
    select.value = 'FL';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(selectedState, `The state selector was unavailable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.county-drilldown-shell')?.innerText.includes('Florida')) &&
      Boolean(document.querySelector('.county-directory-card'))`,
    `Florida county directory at ${viewport.width}px`,
  );
  await waitFor(
    cdp,
    `(() => {
      const details = document.querySelector('.territory-explorer-screen details');
      return Boolean(details &&
        (details.textContent.includes('county-equivalent source records') ||
         details.textContent.includes('County risk data could not be loaded.')));
    })()`,
    `the county risk source status at ${viewport.width}px`,
    60_000,
  );
  const riskSourceStatus = await evaluate(
    cdp,
    `document.querySelector('.territory-explorer-screen details')?.textContent ?? ''`,
  );
  let riskMapReady = false;
  if (riskSourceStatus.includes('County risk data could not be loaded.')) {
    const isDirectLocalVite =
      baseUrl.startsWith('http://127.0.0.1:') ||
      baseUrl.startsWith('http://localhost:');
    assert(
      isDirectLocalVite,
      `County risk source request failed at ${viewport.width}px: ${riskSourceStatus}`,
    );
    console.log(`ℹ ${viewport.width}px: direct local Vite bypasses Replit's root /api proxy; FEMA colors will be checked through PROFILE_TEST_URL`);
  } else {
    riskMapReady = await waitFor(
      cdp,
      `(() => {
        const map = document.querySelector('.county-state-map-svg');
        return Boolean(map && [...map.querySelectorAll('path')]
          .some((path) => path.getAttribute('fill') !== '#475569'));
      })()`,
      `mapped FEMA county risk colors at ${viewport.width}px`,
      60_000,
    );
    assert(riskMapReady, `FEMA county risk colors did not populate at ${viewport.width}px`);
  }
  await evaluate(cdp, `document.querySelector('.county-drilldown-shell')?.scrollIntoView({ block: 'start' })`);
  const countyLayout = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.county-drilldown-shell');
    const breadcrumb = document.querySelector('.geography-drilldown-breadcrumb');
    const sourceDetails = document.querySelector('.territory-explorer-screen details');
    const search = shell?.querySelector('input');
    const action = [...(shell?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.includes('State Providers'));
    const card = document.querySelector('.county-directory-card');
    const title = card?.querySelector('h3');
    const color = (value) => {
      const [r, g, b] = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const channel = (v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground, background) => {
      const a = color(foreground);
      const b = color(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    if (!shell || !search || !action || !card || !title) return null;
    const shellRect = shell.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const cardStyle = getComputedStyle(card);
    return {
      documentWidth: root.scrollWidth,
      shellLeft: shellRect.left,
      shellRight: shellRect.right,
      searchLeft: searchRect.left,
      searchRight: searchRect.right,
      actionLeft: actionRect.left,
      actionRight: actionRect.right,
      titleContrast: contrast(titleStyle.color, cardStyle.backgroundColor),
      cardBackground: cardStyle.backgroundColor,
      titleColor: titleStyle.color,
      sourceDetailsBackground: sourceDetails ? getComputedStyle(sourceDetails).backgroundColor : null,
      breadcrumbBackground: breadcrumb ? getComputedStyle(breadcrumb).backgroundColor : null,
    };
  })()`);
  assert(countyLayout, `Could not measure the county layout at ${viewport.width}px`);
  assert(
    countyLayout.documentWidth <= viewport.width + 1 &&
      countyLayout.shellLeft >= -1 && countyLayout.shellRight <= viewport.width + 1,
    `County directory overflows horizontally at ${viewport.width}px: ${JSON.stringify(countyLayout)}`,
  );
  assert(
    countyLayout.searchLeft >= -1 &&
      countyLayout.searchRight <= viewport.width + 1 &&
      countyLayout.actionLeft >= -1 &&
      countyLayout.actionRight <= viewport.width + 1,
    `County search/action is clipped at ${viewport.width}px: ${JSON.stringify(countyLayout)}`,
  );
  assert(
    countyLayout.titleContrast >= 4.5,
    `County card title contrast is too low at ${viewport.width}px: ${JSON.stringify(countyLayout)}`,
  );
  assert(
    countyLayout.sourceDetailsBackground !== 'rgb(255, 255, 255)' &&
      countyLayout.breadcrumbBackground !== 'rgb(255, 255, 255)',
    `Dark-mode Territory surfaces are still bright white at ${viewport.width}px: ${JSON.stringify(countyLayout)}`,
  );
  if (viewport.width === 390 && riskMapReady) {
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile('/tmp/ems-territory-county-directory-390.png', Buffer.from(screenshot.result.data, 'base64'));
  }

  const openedCounty = await evaluate(cdp, `(() => {
    const card = document.querySelector('.county-directory-card');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  assert(openedCounty, `A county could not be opened at ${viewport.width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.county-city-directory-panel'))`,
    `the selected county city directory at ${viewport.width}px`,
  );
  await evaluate(cdp, `document.querySelector('.county-single-map-panel')?.scrollIntoView({ block: 'start' })`);
  const cityPanel = await evaluate(cdp, `(() => {
    const panel = document.querySelector('.county-city-directory-panel');
    const heading = panel?.querySelector('h4');
    if (!panel || !heading) return null;
    return {
      panelBackground: getComputedStyle(panel).backgroundColor,
      headingColor: getComputedStyle(heading).color,
      width: panel.getBoundingClientRect().width,
      right: panel.getBoundingClientRect().right,
      documentWidth: document.documentElement.scrollWidth,
    };
  })()`);
  assert(cityPanel, `The city directory panel was not rendered at ${viewport.width}px`);
  assert(
    cityPanel.documentWidth <= viewport.width + 1 &&
      cityPanel.right <= viewport.width + 1 &&
      cityPanel.width > 0,
    `The selected county view overflows at ${viewport.width}px: ${JSON.stringify(cityPanel)}`,
  );
  assert(
    cityPanel.panelBackground !== 'rgb(255, 255, 255)',
    `The dark-mode county city directory retained a bright white surface at ${viewport.width}px: ${JSON.stringify(cityPanel)}`,
  );
  if (viewport.width === 390) {
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile('/tmp/ems-territory-selected-county-390.png', Buffer.from(screenshot.result.data, 'base64'));
  }
  console.log(`✓ ${viewport.width}px: county search, directory contrast, selected county map/list, no horizontal overflow`);
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
    `Boolean(document.querySelector('[data-testid="territory-context-breadcrumb"]')) &&
      document.querySelector('[data-testid="territory-context-breadcrumb"]')?.innerText.includes('United States')`,
    'the persistent U.S. territory context in the Agencies workspace',
  );
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

async function verifyComparisonProfileReturn(cdp, width) {
  const openedProfile = await evaluate(cdp, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    };
    const button = [...document.querySelectorAll(
      '[data-testid^="button-open-profile-"]',
    )].find(visible);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(openedProfile, `Could not open an agency profile from comparison at ${width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('main[aria-label$="Account 360 Workspace"]'))`,
    `the comparison agency profile at ${width}px`,
  );
  const returned = await evaluate(cdp, `(() => {
    const button = document.querySelector('button[aria-label="Back to Agencies"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(returned, `Could not return from a compared profile at ${width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="agency-comparison-panel"]')) &&
      !document.querySelector('main[aria-label$="Account 360 Workspace"]')`,
    `comparison to reopen after profile return at ${width}px`,
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
  await verifyComparisonProfileReturn(cdp, viewport.width);

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

async function ensureDarkMode(cdp) {
  const isDark = await evaluate(
    cdp,
    `document.documentElement.classList.contains('dark')`,
  );
  if (!isDark) {
    const toggled = await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll(
        'button[aria-label="Switch to Dark Mode"]',
      )].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 &&
          style.visibility !== 'hidden' && style.display !== 'none' &&
          rect.right > 0 && rect.left < innerWidth &&
          rect.bottom > 0 && rect.top < innerHeight;
      });
      button?.click();
      return Boolean(button);
    })()`);
    assert(toggled, 'Could not reach the dark mode toggle');
  }
  await waitFor(
    cdp,
    `document.documentElement.classList.contains('dark')`,
    'dark mode to activate',
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
      isDarkMode: root.classList.contains('dark'),
      headingPresent: Boolean(heading),
      headingFont: headingStyle?.fontFamily ?? null,
      displayFont: expectedDisplayFont,
      headingColor: headingStyle?.color ?? null,
      expectedText,
      surfacePresent: Boolean(surface),
      surfaceColor: surface ? getComputedStyle(surface).backgroundColor : null,
      expectedSurface,
      wideNodes: [...workspace.querySelectorAll('*')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
            width: Math.round(rect.width),
            left: Math.round(rect.left),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((item) => item.width > 0 && item.scrollWidth > item.clientWidth + 8)
        .slice(0, 10),
    };
  })()`);
  assert(layout, `Missing main workspace content for "${view.tab}" at ${viewport.width}px`);
  assert(
    layout.viewport === viewport.width,
    `Expected ${viewport.width}px viewport, got ${layout.viewport}px`,
  );
  assert(
    layout.isDarkMode &&
      layout.expectedText === 'rgb(231, 239, 241)' &&
      layout.expectedSurface === 'rgb(20, 35, 46)',
    `"${view.tab}" is not using the dark theme tokens at ${viewport.width}px: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.documentWidth <= viewport.width + 1,
    `"${view.tab}" document overflows at ${viewport.width}px (${layout.documentWidth}px wide)`,
  );
  assert(
    layout.mainWidth <= layout.mainClientWidth + 1,
    `"${view.tab}" main workspace overflows at ${viewport.width}px (${layout.mainWidth}px content / ${layout.mainClientWidth}px visible); wide nodes: ${JSON.stringify(layout.wideNodes)}`,
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
  console.log(`✓ ${viewport.width}px: ${view.tab}, dark heading/surface tokens, no horizontal overflow`);
}

async function clickWorkspaceInteraction(cdp, view, interaction, viewport) {
  const clicked = await evaluate(cdp, `(() => {
    const workspace = document.querySelector('main.workspace-grid-shell .operations-workspace');
    const button = [...(workspace?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.innerText.trim().includes(${JSON.stringify(interaction.label)}));
    if (!button) return false;
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`);
  assert(
    clicked,
    `Could not activate "${interaction.label}" in "${view.tab}" at ${viewport.width}px`,
  );

  if (interaction.expectedText) {
    try {
      await waitFor(
        cdp,
        `document.querySelector('main.workspace-grid-shell .operations-workspace')
          ?.innerText.includes(${JSON.stringify(interaction.expectedText)})`,
        `"${interaction.expectedText}" after "${interaction.label}"`,
      );
    } catch (error) {
      const state = await evaluate(cdp, `(() => {
        const workspace = document.querySelector('main.workspace-grid-shell .operations-workspace');
        return JSON.stringify({
          text: workspace?.innerText.slice(-1600) ?? '',
          matchingButtons: [...(workspace?.querySelectorAll('button') ?? [])]
            .map((button) => ({
              text: button.innerText.trim().replace(/\\s+/g, ' ').slice(0, 90),
              className: typeof button.className === 'string' ? button.className.slice(0, 120) : '',
            }))
            .filter((button) => button.text.includes(${JSON.stringify(interaction.label)})),
        });
      })()`);
      throw new Error(`${error.message}. Current interaction state: ${state}`);
    }
  }
  if (interaction.selectedClass) {
    await waitFor(
      cdp,
      `(() => {
        const workspace = document.querySelector('main.workspace-grid-shell .operations-workspace');
        const button = [...(workspace?.querySelectorAll('button') ?? [])]
          .find((candidate) => candidate.innerText.trim().includes(${JSON.stringify(interaction.label)}));
        return button?.className.includes(${JSON.stringify(interaction.selectedClass)}) ?? false;
      })()`,
      `"${interaction.label}" to become selected`,
    );
  }
  await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
    requestAnimationFrame(resolve)))`);

  const dimensions = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const main = document.querySelector('main.workspace-grid-shell');
    if (!main) return null;
    const bounds = main.getBoundingClientRect();
    return {
      viewport: innerWidth,
      documentWidth: root.scrollWidth,
      mainWidth: main.scrollWidth,
      mainClientWidth: main.clientWidth,
      mainLeft: bounds.left,
      mainRight: bounds.right,
      overflowCandidates: [...main.querySelectorAll('*')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
            text: element.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((element) =>
          element.right > bounds.right + 1 ||
          (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0),
        )
        .sort((a, b) =>
          (b.right - b.left) - (a.right - a.left) ||
          (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth),
        )
        .slice(0, 8),
      externalOverflowCandidates: [...main.querySelectorAll('*')]
        .filter((element) => !element.closest('[class*="overflow-x-auto"]'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
            text: element.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((element) =>
          element.right > bounds.right + 1 ||
          (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0),
        )
        .sort((a, b) =>
          (b.right - bounds.right) - (a.right - bounds.right) ||
          (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth),
        )
        .slice(0, 8),
    };
  })()`);
  assert(
    dimensions,
    `Missing main workspace after "${interaction.label}" in "${view.tab}" at ${viewport.width}px`,
  );
  assert(
    dimensions.viewport === viewport.width,
    `Expected ${viewport.width}px viewport after "${interaction.label}", got ${dimensions.viewport}px`,
  );
  assert(
    dimensions.documentWidth <= viewport.width + 1,
    `Document overflows after "${interaction.label}" in "${view.tab}" at ${viewport.width}px (${dimensions.documentWidth}px wide)`,
  );
  assert(
    dimensions.mainWidth <= dimensions.mainClientWidth + 1,
    `Main workspace overflows after "${interaction.label}" in "${view.tab}" at ${viewport.width}px (${dimensions.mainWidth}px content / ${dimensions.mainClientWidth}px visible); external candidates: ${JSON.stringify(dimensions.externalOverflowCandidates)}; all candidates: ${JSON.stringify(dimensions.overflowCandidates)}`,
  );
  assert(
    dimensions.mainLeft >= -1 && dimensions.mainRight <= viewport.width + 1,
    `Main workspace extends beyond the ${viewport.width}px viewport after "${interaction.label}" in "${view.tab}"`,
  );
  console.log(`✓ ${viewport.width}px: ${view.tab} → ${interaction.label}, no horizontal overflow`);
}

async function checkConflictDialogAtViewport(cdp, view, viewport) {
  const filterSelected = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="npi-audit-filter-valid_mismatched"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(
    filterSelected,
    `The flagged mismatch filter was unavailable at ${viewport.width}px`,
  );
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="npi-audit-filter-valid_mismatched"]')?.innerText.includes('Flagged Mismatches')`,
    `the flagged mismatch filter at ${viewport.width}px`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="${view.conflictTestId}"]'))`,
    `the stable read-only conflict item at ${viewport.width}px`,
  );
  const opened = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="${view.conflictTestId}"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(
    opened,
    `The stable read-only conflict item was unavailable at ${viewport.width}px`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="dialog-inspect-conflict"]'))`,
    `the Inspect Conflict dialog at ${viewport.width}px`,
  );
  await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
    requestAnimationFrame(resolve)))`);

  const dimensions = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const main = document.querySelector('main.workspace-grid-shell');
    const dialog = document.querySelector('[data-testid="dialog-inspect-conflict"]');
    const panel = dialog?.querySelector('[data-testid="inspect-conflict-panel"]');
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    };
    return {
      viewport: innerWidth,
      documentWidth: root.scrollWidth,
      main: rect(main),
      dialog: rect(dialog),
      panel: rect(panel),
    };
  })()`);
  assert(dimensions, `Missing Inspect Conflict dialog at ${viewport.width}px`);
  assert(
    dimensions.viewport === viewport.width,
    `Expected ${viewport.width}px viewport, got ${dimensions.viewport}px`,
  );
  assert(
    dimensions.documentWidth <= viewport.width + 1,
    `Document overflows with Inspect Conflict open at ${viewport.width}px (${dimensions.documentWidth}px wide)`,
  );
  assert(
    dimensions.main &&
      dimensions.main.scrollWidth <= dimensions.main.clientWidth + 1 &&
      dimensions.main.left >= -1 &&
      dimensions.main.right <= viewport.width + 1,
    `Main workspace overflows with Inspect Conflict open at ${viewport.width}px: ${JSON.stringify(dimensions.main)}`,
  );
  for (const area of ['dialog', 'panel']) {
    const bounds = dimensions[area];
    assert(
      bounds &&
        bounds.width > 0 &&
        bounds.left >= -1 &&
        bounds.right <= viewport.width + 1 &&
        bounds.top >= -1 &&
        bounds.bottom <= viewport.height + 1 &&
        bounds.scrollWidth <= bounds.clientWidth + 1,
      `Inspect Conflict ${area} exceeds the ${viewport.width}×${viewport.height}px phone screen: ${JSON.stringify(bounds)}`,
    );
  }
  console.log(`✓ ${viewport.width}px: Inspect Conflict dialog stays within document, workspace, and dialog bounds`);

  const closed = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="dialog-inspect-conflict"] button[aria-label="Close Inspect Conflict"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(closed, `Could not close Inspect Conflict at ${viewport.width}px`);
  await waitFor(
    cdp,
    `!document.querySelector('[data-testid="dialog-inspect-conflict"]')`,
    `Inspect Conflict to close at ${viewport.width}px`,
  );
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
    await ensureDarkMode(cdp);
    for (const viewport of workspaceRegressionViewports) {
      await checkSpecialistAndSystemAtViewport(cdp, view, viewport);
    }
    for (const viewport of interactionViewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      for (const interaction of view.interactions) {
        await clickWorkspaceInteraction(cdp, view, interaction, viewport);
      }
      if (view.conflictTestId) {
        await checkConflictDialogAtViewport(cdp, view, viewport);
      }
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
    for (const viewport of [
      { width: 320, height: 740, mobile: true },
      { width: 360, height: 844, mobile: true },
      { width: 390, height: 844, mobile: true },
      { width: 1280, height: 900, mobile: false },
    ]) {
      await checkFireProfileAtViewport(cdp, viewport);
    }
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 390, height: 844 },
    ]) {
      await checkTerritoryAtViewport(cdp, viewport);
    }
    for (const viewport of comparisonViewports) {
      await checkComparisonAtViewport(cdp, viewport, downloadPath);
    }
    await checkSpecialistAndSystemViews(cdp);
    console.log('Agency profile, Territory, comparison, specialist, and system responsive checks passed.');
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
