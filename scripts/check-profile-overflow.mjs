import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

const execFileAsync = promisify(execFile);

const baseUrl =
  process.env.PROFILE_TEST_URL ??
  `http://127.0.0.1:${process.env.PORT ?? '24938'}/`;
const routeSmokeUrls = [
  new URL('/', baseUrl),
  new URL('/ems-territory-intelligence/', baseUrl),
];
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const testViewports = [
  { width: 1366, height: 768, mobile: false },
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 1280, height: 900, mobile: false },
];
const homeMapLandscapeViewports = [
  { width: 667, height: 375, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 932, height: 430, mobile: true },
];
const landscapeFireViewports = [
  { width: 844, height: 390, mobile: true },
  { width: 932, height: 430, mobile: true },
];
const comparisonViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 402, height: 874, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const countyCardViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 1024, height: 640, mobile: false },
  { width: 1366, height: 768, mobile: false },
];
const workspaceRegressionViewports = [
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const sharedNavigationDesktopViewports = [1024, 1280, 1366].map((width) => ({
  width,
  height: width === 1024 ? 640 : 768,
  mobile: false,
}));
const sharedNavigationMobileViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
];
const sharedNavigationWorkspaces = [
  { label: 'Map', navLabel: null },
  { label: 'Reports', navLabel: null },
  { label: 'Agencies', navLabel: null },
  { label: 'Field Work', navLabel: 'Field Work views' },
];
const interactionViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
];
const testCorrectionRecordId = 'browser-check-2026';
const profilePrintCases = [
  {
    category: 'ems',
    agency: 'Cleveland Division of Emergency Medical Service',
    operationsLabel: 'Annual EMS transports',
  },
  {
    category: 'fire',
    agency: 'Miami-Dade County Fire Rescue Department',
    operationsLabel: 'Annual fire-rescue calls',
  },
];
const printPaperSizes = [
  { name: 'Letter', width: 8.5, height: 11, expectedSize: /612 x 792 pts \(letter\)/i },
  { name: 'A4', width: 8.27, height: 11.69, expectedSize: /595\.\d+ x 841\.\d+ pts \(A4\)/i },
];
const fireProfileCases = [
  'Fire Department of New York - Emergency Medical Service Command',
  'Miami-Dade County Fire Rescue Department',
  'Chicago Fire Department - Bureau of EMS',
];
const fireProfileOperationsByViewport = new Map();
const emsProfileCases = [
  'Cleveland Division of Emergency Medical Service',
  'Emergency Medical Services Authority (EMSA) - Oklahoma City',
  'Richmond Ambulance Authority',
];
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

async function checkPublishedRoutes() {
  for (const url of routeSmokeUrls) {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const html = await response.text();
    assert(
      response.ok,
      `${url.pathname} should return HTTP 200 (received ${response.status})`,
    );
    assert(
      contentType.includes('text/html') && html.includes('id="root"'),
      `${url.pathname} should return the EMS Territory Intelligence app HTML`,
    );
    console.log(`PASS published route: ${url.pathname} returned the app HTML`);
  }
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
    const details = response.result.exceptionDetails;
    const reason = details.exception?.description ?? details.exception?.value ?? details.text;
    throw new Error(`${reason}; expression: ${expression.slice(0, 240)}`);
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

async function waitForDownloadedFile(directory, fileName, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    if (files.includes(fileName) && !files.includes(`${fileName}.crdownload`)) {
      return path.join(directory, fileName);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for downloaded file ${fileName}`);
}

async function clickVisibleButton(cdp, label, description = label) {
  const clicked = await evaluate(cdp, `(() => {
    const candidates = [...document.querySelectorAll('button')]
      .filter((button) => button.innerText.trim() === ${JSON.stringify(label)} ||
        button.getAttribute('aria-label') === ${JSON.stringify(label)})
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

async function openPrimaryWorkspace(cdp, label, navSelector) {
  const clicked = await evaluate(cdp, `(() => {
    const nav = document.querySelector(${JSON.stringify(navSelector)});
    const button = [...(nav?.querySelectorAll('button') ?? [])].find((candidate) => {
      const text = candidate.innerText.trim().replace(/\\s+/g, ' ');
      return text === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(`${label} `)});
    });
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not open "${label}" from ${navSelector}`);
  await waitFor(
    cdp,
    `(() => {
      const nav = document.querySelector(${JSON.stringify(navSelector)});
      return [...(nav?.querySelectorAll('button') ?? [])].some((button) => {
        const text = button.innerText.trim().replace(/\\s+/g, ' ');
        return (text === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(`${label} `)})) &&
          button.getAttribute('aria-current') === 'page';
      });
    })()`,
    `"${label}" navigation selection`,
  );
}

async function checkSharedNavigationDesktop(cdp, viewport, workspace) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const pageLayout = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const body = document.body;
    const sidebar = document.querySelector('.pi-primary-sidebar');
    const primaryNav = sidebar?.querySelector('.pi-primary-nav');
    const commandHeader = document.querySelector('.pi-command-header');
    const workspaceBody = document.querySelector('.pi-workspace-body');
    const logo = sidebar?.querySelector('.pi-sidebar-logo');
    const logoImage = logo?.querySelector('img');
    const logoHeader = sidebar?.querySelector(':scope > div:first-child');
    const logoRect = logo?.getBoundingClientRect();
    const logoHeaderRect = logoHeader?.getBoundingClientRect();
    const labels = ['Home', 'Agencies', 'Territory', 'Field Work'];
    const primaryItems = labels.map((label) => {
      const button = [...(primaryNav?.querySelectorAll('button') ?? [])].find((candidate) => {
        const text = candidate.innerText.trim().replace(/\\s+/g, ' ');
        return text === label || text.startsWith(label + ' ');
      });
      if (!button) return { label, missing: true };
      const row = button.parentElement?.classList.contains('rounded-lg')
        ? button.parentElement
        : button;
      const bounds = row.getBoundingClientRect();
      const labelSpan = [...button.querySelectorAll('span')]
        .find((span) => span.innerText.trim().startsWith(label));
      const labelStyle = labelSpan ? getComputedStyle(labelSpan) : getComputedStyle(button);
      const rowStyle = getComputedStyle(button);
      const rect = bounds.toJSON();
      return {
        label,
        selected: button.getAttribute('aria-current') === 'page',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        fontSize: Number.parseFloat(labelStyle.fontSize),
        labelWidth: labelSpan?.clientWidth ?? button.clientWidth,
        labelScrollWidth: labelSpan?.scrollWidth ?? button.scrollWidth,
        visible: rect.width > 0 && rect.height > 0 &&
          rect.left >= -1 && rect.right <= innerWidth + 1 &&
          rect.top >= 0 && rect.bottom <= innerHeight,
        buttonDisplay: rowStyle.display,
      };
    });
    const tabs = document.querySelector(${JSON.stringify(
      workspace.navLabel
        ? `nav[aria-label="${workspace.navLabel}"]`
        : 'nav[aria-label="__no_workspace_tabs__"]',
    )});
    const tabButtons = [...(tabs?.querySelectorAll('button') ?? [])].map((button) => {
      const bounds = button.getBoundingClientRect();
      const rect = bounds.toJSON();
      const style = getComputedStyle(button);
      return {
        label: button.innerText.trim().replace(/\\s+/g, ' '),
        selected: button.getAttribute('aria-current') === 'page',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        height: rect.height,
        minHeight: Number.parseFloat(style.minHeight),
        fontSize: Number.parseFloat(style.fontSize),
        width: rect.width,
        scrollWidth: button.scrollWidth,
        visible: rect.width > 0 && rect.height > 0 &&
          rect.left >= -1 && rect.right <= innerWidth + 1,
      };
    });
    return {
      viewport: innerWidth,
      documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
      sidebar: sidebar ? {
        width: sidebar.getBoundingClientRect().width,
        clientWidth: sidebar.clientWidth,
        scrollWidth: sidebar.scrollWidth,
        visible: getComputedStyle(sidebar).display !== 'none',
      } : null,
      sidebarOffsets: {
        rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
        header: Number.parseFloat(getComputedStyle(commandHeader).paddingLeft),
        workspace: Number.parseFloat(getComputedStyle(workspaceBody).paddingLeft),
      },
      logo: logo && logoImage && logoRect && logoHeaderRect ? {
        src: logoImage.currentSrc,
        naturalWidth: logoImage.naturalWidth,
        rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
        width: logoRect.width,
        height: logoRect.height,
        imageWidth: logoImage.getBoundingClientRect().width,
        imageHeight: logoImage.getBoundingClientRect().height,
        objectFit: getComputedStyle(logoImage).objectFit,
        centeredX: Math.abs((logoRect.left + logoRect.right) / 2 -
          (logoHeaderRect.left + logoHeaderRect.right) / 2) <= 1,
        centeredY: Math.abs((logoRect.top + logoRect.bottom) / 2 -
          (logoHeaderRect.top + logoHeaderRect.bottom) / 2) <= 1,
      } : null,
      primaryNav: primaryNav ? {
        clientWidth: primaryNav.clientWidth,
        scrollWidth: primaryNav.scrollWidth,
      } : null,
      primaryItems,
      tabs: tabs ? {
        clientWidth: tabs.clientWidth,
        scrollWidth: tabs.scrollWidth,
        buttons: tabButtons,
      } : null,
    };
  })()`);

  assert(pageLayout?.sidebar?.visible, `Desktop sidebar is not visible at ${viewport.width}px`);
  assert(
    pageLayout.documentWidth <= viewport.width + 1,
    `Document horizontally overflows at ${viewport.width}px in ${workspace.label}: ${JSON.stringify(pageLayout)}`,
  );
  assert(
    pageLayout.sidebar.width > 0 &&
      pageLayout.sidebar.scrollWidth <= pageLayout.sidebar.clientWidth + 1,
    `Desktop sidebar overflows at ${viewport.width}px in ${workspace.label}: ${JSON.stringify(pageLayout.sidebar)}`,
  );
  assert(
    Math.abs(pageLayout.sidebar.width - pageLayout.sidebarOffsets.rootFontSize * 14) < 0.1 &&
      Math.abs(pageLayout.sidebarOffsets.header - pageLayout.sidebar.width) < 0.1 &&
      Math.abs(pageLayout.sidebarOffsets.workspace - pageLayout.sidebar.width) < 0.1,
    `Desktop sidebar width and content offsets disagree at ${viewport.width}px: ${JSON.stringify({
      sidebar: pageLayout.sidebar,
      offsets: pageLayout.sidebarOffsets,
    })}`,
  );
  assert(
    pageLayout.logo?.src.includes('nicks_ems_logo_1792367124466.jpg') &&
      pageLayout.logo.naturalWidth > 0 &&
      Math.abs(pageLayout.logo.width - pageLayout.logo.rootFontSize * 8.5) < 0.1 &&
      Math.abs(pageLayout.logo.height - pageLayout.logo.rootFontSize * 8.5) < 0.1 &&
      Math.abs(pageLayout.logo.imageWidth - (pageLayout.logo.width - 2)) < 0.1 &&
      Math.abs(pageLayout.logo.imageHeight - (pageLayout.logo.height - 2)) < 0.1 &&
      pageLayout.logo.objectFit === 'cover' &&
      pageLayout.logo.centeredX &&
      pageLayout.logo.centeredY,
    `Desktop logo asset, 8.5rem size, position, or crop changed at ${viewport.width}px: ${JSON.stringify(pageLayout.logo)}`,
  );
  assert(
    pageLayout.primaryNav &&
      pageLayout.primaryNav.scrollWidth <= pageLayout.primaryNav.clientWidth + 1,
    `Primary navigation overflows at ${viewport.width}px in ${workspace.label}: ${JSON.stringify(pageLayout.primaryNav)}`,
  );
  const expectedPrimaryHeight = pageLayout.sidebarOffsets.rootFontSize *
    (viewport.height <= 680 ? 1.85 : viewport.height <= 760 ? 2 : 2.2);
  assert(
    pageLayout.primaryItems.every((item) =>
      !item.missing && item.visible && item.fontSize >= 11 &&
      item.labelScrollWidth <= item.labelWidth + 1 &&
      Math.abs(item.height - expectedPrimaryHeight) <= 1),
    `Primary navigation buttons are clipped, too small, or unreadable at ${viewport.width}px in ${workspace.label}: ${JSON.stringify(pageLayout.primaryItems)}`,
  );
  const primaryLeft = Math.min(...pageLayout.primaryItems.map(({ left }) => left));
  const primaryRight = Math.max(...pageLayout.primaryItems.map(({ right }) => right));
  const primaryHeights = pageLayout.primaryItems.map(({ height }) => height);
  const primaryWorkspaceGaps = [
    pageLayout.primaryItems[1].top - pageLayout.primaryItems[0].bottom,
    pageLayout.primaryItems[3].top - pageLayout.primaryItems[2].bottom,
  ];
  assert(
    pageLayout.primaryItems.every(({ left, right }) =>
      Math.abs(left - primaryLeft) <= 1 && Math.abs(right - primaryRight) <= 1) &&
      Math.max(...primaryHeights) - Math.min(...primaryHeights) <= 2 &&
      primaryHeights.every((height) => height <= 40) &&
      primaryWorkspaceGaps.every((gap) => gap > 0) &&
      Math.abs(primaryWorkspaceGaps[0] - primaryWorkspaceGaps[1]) <= 2,
    `Primary navigation buttons are not consistently aligned at ${viewport.width}px: ${JSON.stringify(pageLayout.primaryItems)}`,
  );
  assert(
    pageLayout.primaryItems.find((item) => item.label === workspace.label)?.selected,
    `"${workspace.label}" is not selected in the primary navigation at ${viewport.width}px`,
  );

  if (workspace.navLabel) {
    const tabs = pageLayout.tabs;
    const tabGaps = tabs?.buttons.slice(1).map((button, index) =>
      button.left - tabs.buttons[index].right) ?? [];
    assert(
      tabs && tabs.buttons.length > 0,
      `${workspace.navLabel} is missing at ${viewport.width}px`,
    );
    assert(
      tabs.scrollWidth <= tabs.clientWidth + 1 &&
        tabs.buttons.every((button) =>
          button.visible && button.minHeight >= 28 && button.fontSize >= 10.5 &&
          button.height <= 44 && button.scrollWidth <= button.width + 1) &&
        tabGaps.every((gap) => gap >= 0) &&
        (tabGaps.length < 2 || Math.max(...tabGaps) - Math.min(...tabGaps) <= 1.5),
      `${workspace.navLabel} is overflowing or has undersized/clipped buttons at ${viewport.width}px: ${JSON.stringify(tabs)}`,
    );
    assert(
      tabs.buttons.some((button) => button.selected),
      `${workspace.navLabel} has no selected tab at ${viewport.width}px`,
    );
  } else {
    assert(!pageLayout.tabs, `Unexpected workspace tabs appeared for ${workspace.label} at ${viewport.width}px`);
  }

  console.log(`✓ ${viewport.width}px: ${workspace.label} shared navigation, alignment, logo, and overflow`);
}

async function checkSharedNavigationMobile(cdp, viewport, enlargedText = false, theme = 'dark') {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('nav[aria-label="Mobile primary workspaces"] button')) &&
      document.querySelector('.pi-command-header')?.getBoundingClientRect().width > 0`,
    `mobile navigation at ${viewport.width}px`,
    60_000,
  );
  await setPrintTheme(cdp, theme);
  await evaluate(cdp, 'document.fonts.ready.then(() => true)');
  if (enlargedText) {
    await evaluate(cdp, `(() => {
      const style = document.createElement('style');
      style.id = 'mobile-navigation-enlarged-text-check';
      style.textContent = 'nav.pi-mobile-nav .pi-mobile-nav__item .pi-mobile-nav__label, nav.pi-mobile-nav .pi-mobile-more__summary .pi-mobile-nav__label { font-size: 14px !important; }';
      document.head.append(style);
      return true;
    })()`);
    await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)))`);
  }

  const logoLayout = await evaluate(cdp, `(() => {
    const header = document.querySelector('.pi-command-header');
    const logo = document.querySelector('.pi-mobile-logo');
    const image = logo?.querySelector('img');
    const bounds = logo?.getBoundingClientRect();
    const headerBounds = header?.getBoundingClientRect();
    return logo && image && bounds && headerBounds ? {
      src: image.currentSrc,
      naturalWidth: image.naturalWidth,
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      width: bounds.width,
      height: bounds.height,
      imageWidth: image.getBoundingClientRect().width,
      imageHeight: image.getBoundingClientRect().height,
      centeredX: Math.abs((bounds.left + bounds.right) / 2 -
        (image.getBoundingClientRect().left + image.getBoundingClientRect().right) / 2) <= 1,
      centeredImageY: Math.abs((bounds.top + bounds.bottom) / 2 -
        (image.getBoundingClientRect().top + image.getBoundingClientRect().bottom) / 2) <= 1,
      objectFit: getComputedStyle(image).objectFit,
      centeredY: Math.abs((bounds.top + bounds.bottom) / 2 -
        (headerBounds.top + headerBounds.bottom) / 2) <= 1,
    } : null;
  })()`);
  assert(
    logoLayout?.src.includes('nicks_ems_logo_1792367124466.jpg') &&
      logoLayout.naturalWidth > 0 &&
      Math.abs(logoLayout.width - logoLayout.rootFontSize * 4.25) < 0.1 &&
      Math.abs(logoLayout.height - logoLayout.rootFontSize * 4.25) < 0.1 &&
      Math.abs(logoLayout.imageWidth - (logoLayout.width - 2)) < 0.1 &&
      Math.abs(logoLayout.imageHeight - (logoLayout.height - 2)) < 0.1 &&
      logoLayout.centeredX &&
      logoLayout.centeredImageY &&
      logoLayout.objectFit === 'contain' &&
      logoLayout.centeredY,
    `Mobile logo asset, 4.25rem size, position, or crop changed at ${viewport.width}px: ${JSON.stringify(logoLayout)}`,
  );

  const navigation = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const body = document.body;
    const nav = document.querySelector('nav[aria-label="Mobile primary workspaces"]');
    if (!nav) return null;
    const navBounds = nav.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll(':scope > .pi-mobile-nav__items > button, :scope > .pi-mobile-nav__items > .pi-mobile-more > summary')].map((button) => {
      const bounds = button.getBoundingClientRect();
      const rect = bounds.toJSON();
      const label = button.querySelector('.pi-mobile-nav__label');
      const labelBounds = label?.getBoundingClientRect();
      const range = document.createRange();
      if (label) range.selectNodeContents(label);
      const textRects = [...range.getClientRects()];
      const text = label?.innerText.trim().replace(/\\s+/g, ' ') ?? '';
      return {
        accessibleName: button.getAttribute('aria-label'),
        text,
        selected: button.getAttribute('aria-current') === 'page',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0 &&
          rect.left >= -1 && rect.right <= innerWidth + 1 &&
          rect.top >= 0 && rect.bottom <= innerHeight,
        labelLeft: labelBounds?.left ?? null,
        labelRight: labelBounds?.right ?? null,
        labelWidth: labelBounds?.width ?? 0,
        labelScrollWidth: label?.scrollWidth ?? 0,
        labelClientWidth: label?.clientWidth ?? 0,
        labelTop: labelBounds?.top ?? null,
        labelBottom: labelBounds?.bottom ?? null,
        labelFontSize: Number.parseFloat(label ? getComputedStyle(label).fontSize : '0'),
        labelLines: new Set(textRects.map((rect) => Math.round(rect.top))).size,
        textFits: textRects.every((textRect) =>
          textRect.left >= rect.left - 1 && textRect.right <= rect.right + 1 &&
          textRect.top >= rect.top - 1 && textRect.bottom <= rect.bottom + 1),
        labelVisible: Boolean(label && labelBounds && getComputedStyle(label).display !== 'none' &&
          labelBounds.width > 0 && labelBounds.left >= rect.left - 1 &&
          labelBounds.right <= rect.right + 1 &&
          labelBounds.top >= rect.top - 1 && labelBounds.bottom <= rect.bottom + 1),
      };
    });
    return {
      viewport: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
      nav: {
        left: navBounds.left,
        right: navBounds.right,
        top: navBounds.top,
        bottom: navBounds.bottom,
        position: getComputedStyle(nav).position,
        bottomInset: getComputedStyle(nav).bottom,
        clientWidth: nav.clientWidth,
        scrollWidth: nav.scrollWidth,
      },
      buttons,
    };
  })()`);
  assert(navigation, `Mobile navigation is missing at ${viewport.width}px`);
  assert(
    navigation.documentWidth <= viewport.width + 1 &&
      navigation.nav.scrollWidth <= navigation.nav.clientWidth + 1 &&
      navigation.nav.left >= -1 && navigation.nav.right <= viewport.width + 1,
    `Mobile navigation overflows at ${viewport.width}px: ${JSON.stringify(navigation)}`,
  );
  assert(
    navigation.buttons.length === 5 &&
      navigation.buttons.every((button) =>
        button.visible && button.width >= 44 && button.height >= 44),
    `Mobile navigation has an unusable touch target at ${viewport.width}px${enlargedText ? ' with enlarged text' : ''}: ${JSON.stringify({ viewportHeight: navigation.viewportHeight, nav: navigation.nav, buttons: navigation.buttons })}`,
  );
  const expectedMobileLabels = [
    { accessibleName: 'Map', visibleLabels: ['Map'] },
    { accessibleName: 'Agencies', visibleLabels: ['Agencies'] },
    { accessibleName: 'Field Work', visibleLabels: ['Field'] },
    { accessibleName: 'Reports', visibleLabels: ['Reports'] },
    { accessibleName: 'More destinations', visibleLabels: ['More'] },
  ];
  assert(
    navigation.buttons.every((button, index) => {
      const expected = expectedMobileLabels[index];
      return button.accessibleName === expected?.accessibleName &&
        expected.visibleLabels.includes(button.text) &&
        button.labelVisible &&
        button.labelLines === 1 &&
        button.textFits &&
        button.labelFontSize >= (enlargedText ? 14 : 12) &&
        button.labelScrollWidth <= button.labelClientWidth + 1;
    }) &&
      new Set(navigation.buttons.map((button) => button.text)).size === 5 &&
      navigation.buttons.slice(1).every((button, index) =>
        button.labelLeft >= navigation.buttons[index].labelRight - 1),
    `Mobile workspace labels are missing, clipped, or overlapping at ${viewport.width}px${enlargedText ? ' with enlarged text' : ''}: ${JSON.stringify(navigation.buttons)}`,
  );

  for (const { label, accessibleName } of [
    { label: 'Map', accessibleName: 'Map' },
    { label: 'Agencies', accessibleName: 'Agencies' },
    { label: 'Field Work', accessibleName: 'Field Work' },
    { label: 'Reports', accessibleName: 'Reports' },
  ]) {
    const clicked = await evaluate(cdp, `(() => {
      const nav = document.querySelector('nav[aria-label="Mobile primary workspaces"]');
      const button = [...(nav?.querySelectorAll(':scope > .pi-mobile-nav__items > button, :scope > .pi-mobile-nav__items > .pi-mobile-more > summary') ?? [])].find((candidate) =>
        candidate.getAttribute('aria-label') === ${JSON.stringify(accessibleName)});
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(clicked, `Could not open "${label}" from mobile navigation at ${viewport.width}px`);
    await waitFor(
      cdp,
      `(() => {
        const nav = document.querySelector('nav[aria-label="Mobile primary workspaces"]');
        return [...(nav?.querySelectorAll(':scope > .pi-mobile-nav__items > button, :scope > .pi-mobile-nav__items > .pi-mobile-more > summary') ?? [])].some((button) =>
          button.getAttribute('aria-label') === ${JSON.stringify(accessibleName)} &&
          button.getAttribute('aria-current') === 'page');
      })()`,
      `"${label}" mobile navigation selection at ${viewport.width}px`,
    );
    // Let the existing 140ms selection-color transition finish before comparing.
    await evaluate(cdp, 'new Promise((resolve) => setTimeout(resolve, 180))');
    const selectedLayout = await evaluate(cdp, `(() => {
      const nav = document.querySelector('nav[aria-label="Mobile primary workspaces"]');
      const button = nav?.querySelector('button[aria-current="page"]');
      const label = button?.querySelector('.pi-mobile-nav__label');
      if (!button || !label) return null;
      const bounds = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const textRects = [...range.getClientRects()];
      const marker = getComputedStyle(button, '::before');
      return {
        name: button.getAttribute('aria-label'),
        singleLine: new Set(textRects.map((rect) => Math.round(rect.top))).size === 1,
        textFits: textRects.every((rect) =>
          rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
          rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1),
        hasMarker: marker.content === '""' && Number.parseFloat(marker.height) >= 2,
        distinctColor: [...nav.querySelectorAll('button:not([aria-current="page"])')]
          .every((other) => getComputedStyle(other).color !== getComputedStyle(button).color),
      };
    })()`);
    assert(
      selectedLayout?.name === accessibleName && selectedLayout.singleLine &&
        selectedLayout.textFits && selectedLayout.hasMarker && selectedLayout.distinctColor,
      `Selected "${label}" label or indicator is unclear in ${theme} at ${viewport.width}px${enlargedText ? ' with enlarged text' : ''}: ${JSON.stringify(selectedLayout)}`,
    );
  }
  console.log(`✓ ${theme} / ${viewport.width}px: five mobile destinations, full accessible names, touch targets, logo, and workspace selection`);
}

async function checkMobileNavigationLabels(cdp) {
  for (const theme of ['daylight', 'dark', 'miami-vice']) {
    for (const viewport of sharedNavigationMobileViewports) {
      await checkSharedNavigationMobile(cdp, viewport, false, theme);
      await checkSharedNavigationMobile(cdp, viewport, true, theme);
    }
  }
}

async function checkMobileNavigationAccessibility(cdp, viewport) {
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('nav[aria-label="Mobile primary workspaces"] button')) &&
      document.querySelector('.pi-command-header')?.getBoundingClientRect().width > 0`,
    `mobile navigation accessibility at ${viewport.width}px`,
    60_000,
  );

  const expectedNames = ['Map', 'Agencies', 'Field Work', 'Reports', 'More destinations'];
  const navNode = await cdp.send('DOM.getDocument', { depth: -1 });
  const nav = await cdp.send('DOM.querySelector', {
    nodeId: navNode.result.root.nodeId,
    selector: 'nav[aria-label="Mobile primary workspaces"]',
  });
  assert(nav.result.nodeId, `Mobile primary navigation is missing at ${viewport.width}px`);
  const buttonNodes = await cdp.send('DOM.querySelectorAll', {
    nodeId: nav.result.nodeId,
    selector: '.pi-mobile-nav__items > button, .pi-mobile-nav__items > .pi-mobile-more > summary',
  });
  const buttons = [];
  for (const nodeId of buttonNodes.result.nodeIds) {
    const description = await cdp.send('DOM.describeNode', { nodeId });
    const attributes = description.result.node.attributes;
    const ariaLabelIndex = attributes?.indexOf('aria-label') ?? -1;
    buttons.push({
      nodeId,
      backendNodeId: description.result.node.backendNodeId,
      accessibleName: ariaLabelIndex >= 0
        ? attributes[ariaLabelIndex + 1]
        : null,
    });
  }
  assert(
    buttons.length === expectedNames.length &&
      buttons.every((button, index) => button.accessibleName === expectedNames[index]),
    `Mobile navigation items do not expose the five full accessible names in order: ${JSON.stringify(buttons)}`,
  );

  const getAccessibilityNodes = async () => {
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')).result;
    return buttons.map((button, index) => {
      const node = nodes.find((candidate) =>
        candidate.backendDOMNodeId === button.backendNodeId);
      return {
        expectedName: expectedNames[index],
        role: node?.role?.value,
        name: node?.name?.value,
        expanded: node?.properties?.find((property) => property.name === 'expanded')?.value?.value,
      };
    });
  };
  const accessibleNodes = await getAccessibilityNodes();
  assert(
    accessibleNodes.every((node, index) =>
      (index === expectedNames.length - 1
        ? node.role === 'DisclosureTriangle'
        : node.role === 'button') && node.name === expectedNames[index]),
    `Chromium accessibility tree does not expose the intended mobile navigation names: ${JSON.stringify(accessibleNodes)}`,
  );

  const firstButtonFocused = await evaluate(cdp, `(() => {
    const buttons = [...document.querySelectorAll(
      'nav[aria-label="Mobile primary workspaces"] > .pi-mobile-nav__items > button, nav[aria-label="Mobile primary workspaces"] > .pi-mobile-nav__items > .pi-mobile-more > summary'
    )];
    buttons[0]?.focus();
    return document.activeElement === buttons[0];
  })()`);
  assert(firstButtonFocused, 'Could not focus the first mobile navigation item');
  const focusedNames = [];
  for (let index = 0; index < expectedNames.length; index += 1) {
    focusedNames.push(await evaluate(cdp, `document.activeElement?.getAttribute('aria-label') ?? null`));
    if (index < expectedNames.length - 1) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
    }
  }
  assert(
    focusedNames.every((name, index) => name === expectedNames[index]),
    `Keyboard focus does not follow mobile workspace order: ${JSON.stringify(focusedNames)}`,
  );

  const moreButtonBackendNodeId = buttons.at(-1)?.backendNodeId;
  const setMoreExpanded = async (expanded) => {
    const expression = `(() => {
      const details = document.querySelector('nav[aria-label="Mobile primary workspaces"] .pi-mobile-more');
      const summary = details?.querySelector('summary');
      if (!details || !summary) return false;
      if (details.open !== ${JSON.stringify(expanded)}) summary.click();
      return true;
    })()`;
    assert(await evaluate(cdp, expression), `Could not set More to ${expanded ? 'expanded' : 'collapsed'}`);
    await waitFor(
      cdp,
      `document.querySelector('nav[aria-label="Mobile primary workspaces"] .pi-mobile-more')
        ?.open === ${JSON.stringify(expanded)}`,
      `More to become ${expanded ? 'expanded' : 'collapsed'}`,
    );
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')).result;
    const axNode = nodes.find((node) =>
      node.backendDOMNodeId === moreButtonBackendNodeId);
    const state = axNode?.properties?.find((property) => property.name === 'expanded')?.value?.value;
    assert(
      state === expanded,
      `More ${expanded ? 'expanded' : 'collapsed'} state is absent from Chromium's accessibility tree: ${JSON.stringify(axNode)}`,
    );
  };
  await setMoreExpanded(true);
  await setMoreExpanded(false);
  console.log(`✓ ${viewport.width}px: five accessible primary destinations, keyboard focus order, and More expanded state`);
}

async function checkSharedNavigation(cdp) {
  for (const viewport of [
    { width: 844, height: 560, mobile: false },
    { width: 1024, height: 560, mobile: false },
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: baseUrl });
    await waitFor(
      cdp,
      `Boolean(document.querySelector('.pi-primary-sidebar .pi-primary-nav'))`,
      `compact desktop navigation at ${viewport.width}px`,
      60_000,
    );
    await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)))`);
    const layout = await evaluate(cdp, `(() => {
      const root = document.documentElement;
      const sidebar = document.querySelector('.pi-primary-sidebar');
      const nav = sidebar?.querySelector('.pi-primary-nav');
      const header = document.querySelector('.pi-command-header');
      const workspace = document.querySelector('.pi-workspace-body');
      return {
        rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
        sidebarWidth: sidebar?.getBoundingClientRect().width,
        headerOffset: Number.parseFloat(getComputedStyle(header).paddingLeft),
        workspaceOffset: Number.parseFloat(getComputedStyle(workspace).paddingLeft),
        sidebarOverflow: getComputedStyle(sidebar).overflowY,
        navOverflow: getComputedStyle(nav).overflowY,
        navMaxHeight: getComputedStyle(nav).maxHeight,
      };
    })()`);
    const expectedWidth = 14;
    assert(
      layout &&
        Math.abs(layout.sidebarWidth - layout.rootFontSize * expectedWidth) < 0.1 &&
        Math.abs(layout.headerOffset - layout.sidebarWidth) < 0.1 &&
        Math.abs(layout.workspaceOffset - layout.sidebarWidth) < 0.1 &&
        layout.sidebarOverflow === 'auto' &&
        layout.navOverflow === 'visible' &&
        layout.navMaxHeight === 'none',
      `Compact desktop sidebar sizing or overflow is inconsistent at ${viewport.width}×${viewport.height}px: ${JSON.stringify(layout)}`,
    );
    console.log(`✓ ${viewport.width}×${viewport.height}px: compact desktop sidebar width, offsets, and overflow`);
  }

  for (const viewport of sharedNavigationDesktopViewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: baseUrl });
    await waitFor(
      cdp,
      `Boolean(document.querySelector('.pi-primary-sidebar .pi-primary-nav'))`,
      `desktop navigation at ${viewport.width}px`,
      60_000,
    );
    await waitFor(
      cdp,
      `(() => {
        const image = document.querySelector('.pi-sidebar-logo img');
        return Boolean(image?.complete && image.naturalWidth > 0);
      })()`,
      `the existing desktop logo at ${viewport.width}px`,
    );

    for (const workspace of sharedNavigationWorkspaces) {
      await openPrimaryWorkspace(
        cdp,
        workspace.label,
        '.pi-primary-sidebar .pi-primary-nav',
      );
      if (workspace.navLabel) {
        await waitFor(
          cdp,
          `Boolean(document.querySelector(${JSON.stringify(`nav[aria-label="${workspace.navLabel}"]`)}))`,
          `${workspace.navLabel} at ${viewport.width}px`,
        );
      }
      await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(resolve)))`);
      await checkSharedNavigationDesktop(cdp, viewport, workspace);
    }
  }

  await checkMobileNavigationLabels(cdp);
  console.log('Shared desktop and mobile navigation regression checks passed.');
}

async function openAgencyProfile(cdp, providerCategory = 'all', agencyName = null, options = {}) {
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
        .find((button) => new RegExp('^' + expected + '\\\\s*(?:\\\\(|$)', 'i').test(button.innerText.trim()));
      const button = candidate || fallback;
      if (!button) return false;
      button.click();
      return true;
    })()`);
    const filterDiagnostics = selectedCategory ? null : await evaluate(cdp, `JSON.stringify({
      width: innerWidth,
      controls: [...document.querySelectorAll('button')].map(button => ({
        text: button.innerText.trim(),
        aria: button.getAttribute('aria-label'),
        visible: button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0,
      })).filter(item => /filter|ems|fire|all/i.test(item.text + ' ' + item.aria)).slice(-16),
      group: Boolean(document.querySelector('[aria-label="Provider Discipline Filter"]')),
      body: document.body.innerText.slice(-900),
    })`);
    assert(selectedCategory, `Could not select the ${providerCategory} provider filter${filterDiagnostics ? `; screen: ${filterDiagnostics}` : ''}`);
    const expectedProviderLabel = providerCategory === 'fire' ? 'Fire Department' : 'EMS Provider';
    await waitFor(
      cdp,
      `document.body.innerText.includes(${JSON.stringify(expectedProviderLabel)})`,
      `the ${providerCategory} agency directory`,
    );
  }
  if (agencyName) {
    const searchReady = await evaluate(cdp, `(() => {
      const input = document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]');
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, ${JSON.stringify(agencyName)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(searchReady, 'Could not search for the requested Fire agency');
    await waitFor(
      cdp,
      `Boolean([...document.querySelectorAll('h3')]
        .find((heading) => heading.innerText.trim() === ${JSON.stringify(agencyName)}))`,
      `the ${agencyName} directory result`,
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
    const heading = ${agencyName
      ? `[...document.querySelectorAll('h3')]
          .find((candidate) => candidate.innerText.trim() === ${JSON.stringify(agencyName)})`
      : 'null'};
    let button = null;
    if (heading) {
      let card = heading;
      while (card && card !== document.body && !button) {
        button = [...card.querySelectorAll('button, a, [role="button"]')]
          .find((candidate) => candidate.innerText.trim().startsWith('Open agency profile'));
        card = card.parentElement;
      }
    } else {
      button = [...document.querySelectorAll('button, a, [role="button"]')]
        .find((candidate) => candidate.innerText.trim().includes('Open agency profile'));
    }
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
  if (options.commandOverview) {
    await waitFor(
      cdp,
      `Boolean(document.querySelector('[data-testid="profile-command-overview"] .acp-ledger'))`,
      'the equipment-first provider Overview',
    );
    return;
  }
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
    const baseline = profile?.querySelector('[data-testid="agency-operational-baseline"]');
    const operations = baseline?.querySelector('[data-testid="baseline-operational-metrics"]');
    const lead = operations?.innerText.trim() || '';
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
      baselinePresent: Boolean(baseline),
      operationsLead: lead,
      correctOperations: isFire
        ? /\\bstations\\b/i.test(lead) &&
          /fire suppression engines/i.test(baseline?.innerText ?? '') &&
          /reported fire-rescue calls/i.test(baseline?.innerText ?? '')
        : /active ambulances/i.test(baseline?.innerText ?? '') &&
          !/fire suppression engines/i.test(baseline?.innerText ?? '') &&
          /reported EMS calls/i.test(baseline?.innerText ?? ''),
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
    profileSummaryChecks.baselinePresent && profileSummaryChecks.correctOperations,
    `${providerCategory} profile has the wrong top operational baseline: ${JSON.stringify(profileSummaryChecks)}`,
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
  await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (select) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        ?.set?.call(select, 'overview');
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      [...document.querySelectorAll('[data-testid="profile-topic-navigation"] button')]
        .find((button) => button.innerText.trim() === '1. Overview')
        ?.click();
    }
  })()`);
  await waitFor(
    cdp,
    `document.querySelectorAll('main.profile-workspace [data-testid="agency-intelligence-overview"]').length === 1`,
    'the default overview to return after source-workspace checks',
  );
}

async function setPrintTheme(cdp, theme) {
  const changed = await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="theme-select-desktop"]');
    if (!select) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
      ?.set?.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not select the ${theme} appearance theme`);
  await waitFor(
    cdp,
    `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
    `the ${theme} appearance theme`,
  );
}

async function checkProviderOverviewPrintCase(cdp, testCase, pdfDirectory, theme, paperSize) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      Boolean([...document.querySelectorAll('button')].find((button) =>
        button.innerText.trim() === 'Agencies'))`,
    'the app shell before opening a printable Overview',
    60_000,
  );
  await setPrintTheme(cdp, theme);
  await openAgencyProfile(cdp, testCase.category, testCase.agency, { commandOverview: true });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="profile-command-overview"] .acp-ledger')) &&
      document.querySelectorAll('[data-testid^="row-overview-equipment-"]').length === 6`,
    `the six-row ${testCase.category} provider Overview`,
  );

  const fixture = {
    longModel: 'ZOLL X Series Advanced Pro Defibrillator with Extended Clinical Monitoring and Transport Package Model 12A-Clinical-Plus',
    categories: [
      ['monitor', 'Monitor / defibrillator'],
      ['cpr', 'Mechanical CPR'],
      ['vent', 'Transport ventilator'],
      ['epcrcad', 'ePCR / CAD (combined record)'],
      ['dispatch', 'Dispatch CAD vendor'],
      ['billing', 'Billing software'],
    ],
  };
  const prepared = await evaluate(cdp, `(() => {
    const overview = document.querySelector('[data-testid="profile-command-overview"]');
    const ledger = overview?.querySelector('.acp-ledger');
    if (!overview || !ledger) return null;
    const rows = [...ledger.querySelectorAll('.acp-ledger-row')];
    if (rows.length !== 6) return null;
    for (const row of rows) {
      const value = row.querySelector('.acp-ledger-value');
      const quantity = row.querySelector('.acp-ledger-qty');
      if (!value || !quantity) return null;
      if (row.dataset.category === 'monitor') {
        value.textContent = ${JSON.stringify(fixture.longModel)};
        value.classList.remove('is-missing');
        row.removeAttribute('data-missing');
        quantity.textContent = '1,204 units';
        quantity.classList.remove('is-missing');
      } else {
        value.textContent = 'Not reported';
        value.classList.add('is-missing');
        row.dataset.missing = 'true';
        quantity.textContent = row.dataset.category === 'software' ? '' : 'Units not reported';
        quantity.classList.toggle('is-missing', row.dataset.category !== 'software');
      }
    }
    return {
      rowCount: rows.length,
      labels: rows.map((row) => row.querySelector('.acp-ledger-label')?.innerText.trim() ?? ''),
      values: rows.map((row) => row.querySelector('.acp-ledger-value')?.innerText.trim() ?? ''),
      quantities: rows.map((row) => row.querySelector('.acp-ledger-qty')?.innerText.trim() ?? ''),
      agency: document.querySelector('.profile-workspace h1')?.innerText.trim() ?? '',
      caveat: ledger.querySelector('.acp-ledger-foot')?.innerText.trim() ?? '',
    };
  })()`);
  assert(
    prepared?.rowCount === 6 &&
      prepared.labels.length === fixture.categories.length &&
      prepared.values.includes(fixture.longModel) &&
      prepared.quantities.includes('1,204 units') &&
      prepared.quantities.filter((quantity) => quantity === 'Units not reported').length === 2 &&
      prepared.values.filter((value) => value === 'Not reported').length === 5 &&
      /Inventory as recorded/i.test(prepared.caveat) &&
      /not condition, intent or buy-back eligibility/i.test(prepared.caveat),
    `${testCase.category} print fixture does not cover the full sparse equipment ledger: ${JSON.stringify(prepared)}`,
  );

  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printState = await evaluate(cdp, `(() => {
    const profile = document.querySelector('.agency-command-profile');
    const ledger = profile?.querySelector('.acp-ledger');
    const foot = ledger?.querySelector('.acp-ledger-foot');
    const rows = [...(ledger?.querySelectorAll('.acp-ledger-row') ?? [])];
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility === 'visible';
    };
    const rgb = (color) => (color.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color) => {
      const channels = rgb(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const white = 'rgb(255, 255, 255)';
    const longValue = ledger?.querySelector('[data-category="monitor"] .acp-ledger-value');
    const missingValue = ledger?.querySelector('[data-category="cpr"] .acp-ledger-value');
    const missingQuantity = ledger?.querySelector('[data-category="cpr"] .acp-ledger-qty');
    const measuredRows = rows.map((row) => {
      const bounds = row.getBoundingClientRect();
      const texts = [...row.querySelectorAll('.acp-ledger-label, .acp-ledger-value, .acp-ledger-qty')];
      return {
        category: row.dataset.category,
        visible: visible(row),
        textInside: texts.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
            element.scrollWidth <= element.clientWidth + 2 &&
            element.scrollHeight <= element.clientHeight + 2;
        }),
      };
    });
    const outsideVisibleText = [...document.body.querySelectorAll('*')]
      .filter((element) => element.children.length === 0 && element.textContent?.trim())
      .filter((element) => !profile?.contains(element))
      .filter((element) => visible(element))
      .map((element) => element.textContent.trim()).slice(0, 5);
    return {
      printMedia: matchMedia('print').matches,
      overviewVisible: visible(ledger),
      rowCount: rows.length,
      rows: measuredRows,
      longValueWraps: (() => {
        if (!longValue) return false;
        const range = document.createRange();
        range.selectNodeContents(longValue);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
      })(),
      longValueColor: longValue ? getComputedStyle(longValue).color : '',
      missingValueColor: missingValue ? getComputedStyle(missingValue).color : '',
      missingQuantityColor: missingQuantity ? getComputedStyle(missingQuantity).color : '',
      caveatColor: foot ? getComputedStyle(foot).color : '',
      background: ledger ? getComputedStyle(ledger).backgroundColor : '',
      caveatVisible: Boolean(foot && visible(foot)),
      caveatText: foot?.innerText.trim() ?? '',
      contrast: {
        longValue: longValue ? contrast(getComputedStyle(longValue).color, white) : 0,
        missingValue: missingValue ? contrast(getComputedStyle(missingValue).color, white) : 0,
        missingQuantity: missingQuantity ? contrast(getComputedStyle(missingQuantity).color, white) : 0,
        caveat: foot ? contrast(getComputedStyle(foot).color, white) : 0,
      },
      outsideVisibleText,
    };
  })()`);
  assert(
    printState?.printMedia &&
      printState.overviewVisible &&
      printState.rowCount === 6 &&
      printState.rows.every((row) => row.visible && row.textInside) &&
      printState.longValueWraps &&
      printState.background === 'rgb(255, 255, 255)' &&
      printState.contrast.longValue >= 4.5 &&
      printState.contrast.missingValue >= 4.5 &&
      printState.contrast.missingQuantity >= 4.5 &&
      printState.contrast.caveat >= 4.5 &&
      printState.caveatVisible &&
      /buy-back eligibility/i.test(printState.caveatText) &&
      printState.outsideVisibleText.length === 0,
    `${testCase.category} Overview print layout clips content, loses paper-safe contrast, or exposes other workspace content: ${JSON.stringify(printState)}`,
  );

  const pdfResult = await cdp.send('Page.printToPDF', {
    paperWidth: paperSize.width,
    paperHeight: paperSize.height,
    preferCSSPageSize: false,
    printBackground: true,
    transferMode: 'ReturnAsBase64',
  });
  const pdfPath = path.join(
    pdfDirectory,
    `overview-${testCase.category}-${theme}-${paperSize.name.toLowerCase()}.pdf`,
  );
  await writeFile(pdfPath, Buffer.from(pdfResult.result.data, 'base64'));
  const [{ stdout: pdfInfo }, { stdout: extractedText }] = await Promise.all([
    execFileAsync('pdfinfo', [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
    execFileAsync('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 4 * 1024 * 1024 }),
  ]);
  const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
  const pageSize = pdfInfo.match(/^Page size:\s+(.+)$/m)?.[1] ?? '';
  const pages = extractedText.split('\f').map((page) => page.trim()).filter(Boolean);
  const normalizedPdfText = extractedText.replace(/\s+/g, ' ').toLowerCase();
  const alphanumericPdfText = normalizedPdfText.replace(/[^a-z0-9]/g, '');
  const containsWords = (value) => value.toLowerCase().split(/\s+/)
    .filter(Boolean)
    .every((word) => alphanumericPdfText.includes(word.replace(/[^a-z0-9]/g, '')));
  const missingLabels = fixture.categories
    .map(([, label]) => label)
    .filter((label) => !containsWords(label));
  const longModelMissingWords = fixture.longModel.split(/\s+/)
    .filter((word) => !normalizedPdfText.includes(word.toLowerCase()));
  assert(
    paperSize.expectedSize.test(pageSize),
    `${testCase.category} Overview PDF is not ${paperSize.name} portrait paper: ${pageSize}`,
  );
  assert(
    pageCount > 0 && pageCount <= 8 &&
      pages.length === pageCount && pages.every((page) => page.length > 0),
    `${testCase.category} Overview PDF has empty or unexpected pages (${pageCount} pages, ${pages.length} with text)`,
  );
  assert(
    containsWords(testCase.agency) &&
      missingLabels.length === 0 &&
      longModelMissingWords.length === 0 &&
      containsWords('1,204 units') &&
      containsWords('Units not reported') &&
      normalizedPdfText.includes('not reported') &&
      containsWords('Inventory as recorded') &&
      containsWords('not condition, intent or buy-back eligibility'),
    `${testCase.category} ${paperSize.name} Overview PDF lost category, quantity, missing-value, long-model, or caveat text: ${JSON.stringify({
      missingLabels,
      longModelMissingWords,
      text: normalizedPdfText.slice(0, 1800),
    })}`,
  );
  await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });
  console.log(
    `✓ Provider Overview / ${testCase.category} / ${theme} / ${paperSize.name}: ${pageCount} non-empty page(s), six categories, sparse values, long model, caveat, and contrast retained`,
  );
}

async function checkProfilePrintCase(
  cdp,
  testCase,
  pdfDirectory,
  downloadDirectory,
  theme,
  paperSize,
) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      Boolean([...document.querySelectorAll('button')].find((button) =>
        button.innerText.trim() === 'Agencies'))`,
    'the app shell before opening a printable profile',
    60_000,
  );
  await setPrintTheme(cdp, theme);
  await openAgencyProfile(cdp, testCase.category, testCase.agency, { commandOverview: true });

  const briefOpened = await evaluate(cdp, `(() => {
    const actions = document.querySelector('.profile-more-actions');
    const button = document.querySelector('[data-testid="button-profile-print-brief"]');
    if (!actions || !button) return false;
    actions.open = true;
    button.click();
    return true;
  })()`);
  assert(briefOpened, `Could not open the ${testCase.category} print brief`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#briefing-dossier-modal-container .print-source-references'))`,
    `the ${testCase.category} agency brief`,
  );

  const briefDetails = await evaluate(cdp, `(() => {
    const modal = document.querySelector('#briefing-dossier-modal-container');
    const documentRoot = modal?.querySelector('.print-dossier-document');
    const overview = documentRoot?.querySelector('[data-report-section="overview"]');
    const references = [...(documentRoot?.querySelectorAll('.print-source-references li') ?? [])]
      .map((item) => ({
        text: item.innerText.trim(),
        sourceName: item.querySelectorAll('div')[1]?.innerText.trim() ?? '',
        period: [...item.querySelectorAll('div')]
          .map((element) => element.innerText.trim())
          .find((text) => /^Reporting period:/i.test(text)) ?? '',
        links: [...item.querySelectorAll('a[href]')].map((link) => ({
          href: link.href,
          text: link.innerText.trim(),
        })),
      }));
    return {
      identity: documentRoot?.querySelector('.print-agency-identity h1')?.innerText.trim() ?? '',
      operations: documentRoot?.querySelector('.print-summary')?.innerText.trim() ?? '',
      operationsValues: [...(documentRoot?.querySelectorAll('.print-summary-value') ?? [])]
        .map((element) => element.innerText.trim())
        .filter(Boolean),
      identifiers: documentRoot?.querySelector('.print-agency-identifiers')?.innerText.trim() ?? '',
      overviewOrder: [
        '.print-agency-identity',
        '.print-summary',
        '.print-agency-identifiers',
        '.print-profile-review',
      ].map((selector) => [...(overview?.children ?? [])].findIndex((element) =>
        element.matches(selector))),
      screenHierarchy: {
        identity: Number.parseFloat(getComputedStyle(documentRoot?.querySelector('.print-agency-identity h1')).fontSize),
        operations: Number.parseFloat(getComputedStyle(documentRoot?.querySelector('.print-summary-value')).fontSize),
        identifiers: Number.parseFloat(getComputedStyle(documentRoot?.querySelector('.print-agency-identifiers')).fontSize),
      },
      review: documentRoot?.querySelector('.print-profile-review')?.innerText.trim() ?? '',
      tableCells: [...(documentRoot?.querySelectorAll('table') ?? [])]
        .flatMap((table) => [...table.querySelectorAll('th, td')])
        .map((cell) => cell.innerText.trim())
        .filter((text) => text.length >= 3),
      references,
      hasPrintAction: [...(modal?.querySelectorAll('button') ?? [])]
        .some((button) => button.innerText.trim() === 'Print / Save PDF'),
    };
  })()`);
  assert(
    briefDetails?.identity === testCase.agency,
    `${testCase.category} brief identity does not match ${testCase.agency}`,
  );
  assert(
    /Operations summary/i.test(briefDetails.operations) &&
      briefDetails.operations.includes(testCase.operationsLabel),
    `${testCase.category} brief is missing its operations summary: ${briefDetails.operations}`,
  );
  assert(
    /Registry IDs/i.test(briefDetails.identifiers) &&
      /FDID:/i.test(briefDetails.identifiers) &&
      /NPI:/i.test(briefDetails.identifiers) &&
      /Taxonomy:/i.test(briefDetails.identifiers) &&
      briefDetails.overviewOrder.every((index) => index >= 0) &&
      briefDetails.overviewOrder.every((index, order, indexes) =>
        order === 0 || indexes[order - 1] < index) &&
      briefDetails.screenHierarchy.identity > briefDetails.screenHierarchy.operations &&
      briefDetails.screenHierarchy.operations > briefDetails.screenHierarchy.identifiers,
    `${testCase.category} brief does not keep identity and operations ahead of subordinate identifiers`,
  );
  assert(
    briefDetails.references.length > 0 &&
      briefDetails.references.some((reference) => reference.text && reference.links.length > 0),
    `${testCase.category} brief has no field-level linked source references`,
  );
  assert(
    /not marked reviewed|not independent verification/i.test(briefDetails.review),
    `${testCase.category} brief is missing user-review wording: ${briefDetails.review}`,
  );
  assert(briefDetails.hasPrintAction, `${testCase.category} brief has no print action`);

  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printState = await evaluate(cdp, `(() => {
    const modal = document.querySelector('#briefing-dossier-modal-container');
    const shell = document.querySelector('.pi-app-shell');
    const doc = modal?.querySelector('.print-dossier-document');
    const outsideVisibleText = [...document.body.querySelectorAll('*')]
      .filter((element) => !modal?.contains(element) && element.children.length === 0)
      .filter((element) => element.textContent?.trim())
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
    return {
      outsideVisibleText: outsideVisibleText.map((element) => element.textContent.trim()).slice(0, 5),
      shellSiblingsHidden: [...(shell?.children ?? [])]
        .filter((element) => !element.classList.contains('provider-profile-overlay'))
        .every((element) => getComputedStyle(element).display === 'none'),
      noPrintHidden: [...(modal?.querySelectorAll('.no-print') ?? [])]
        .every((element) => getComputedStyle(element).display === 'none'),
      documentVisible: Boolean(doc && getComputedStyle(doc).visibility === 'visible' &&
        getComputedStyle(doc).display !== 'none'),
      hierarchy: {
        identity: Number.parseFloat(getComputedStyle(doc?.querySelector('.print-agency-identity h1')).fontSize),
        operations: Number.parseFloat(getComputedStyle(doc?.querySelector('.print-summary-value')).fontSize),
        identifiers: Number.parseFloat(getComputedStyle(doc?.querySelector('.print-agency-identifiers')).fontSize),
        review: Number.parseFloat(getComputedStyle(doc?.querySelector('.print-profile-review')).fontSize),
      },
      colors: (() => {
        const rgb = (color) => (color.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (color) => {
          const channels = rgb(color).map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const contrast = (foreground, background) => {
          const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return (values[0] + 0.05) / (values[1] + 0.05);
        };
        const white = 'rgb(255, 255, 255)';
        const heading = doc?.querySelector('.print-agency-identity h1');
        const summaryValue = doc?.querySelector('.print-summary-value');
        const sourceLink = doc?.querySelector('.print-source-references a');
        const headings = [...(doc?.querySelectorAll('h1, h2, h3, th') ?? [])]
          .map((element) => ({
            text: element.innerText.trim(),
            color: getComputedStyle(element).color,
            contrast: contrast(getComputedStyle(element).color, white),
          }))
          .filter((element) => element.text);
        const evidenceText = [...(doc?.querySelectorAll('.print-source-references li') ?? [])]
          .flatMap((item) => [...item.children]
            .filter((element) =>
              element.tagName === 'DIV' &&
              !element.querySelector('.print-status-badge, a') &&
              element.innerText.trim())
            .map((element) => ({
              text: element.innerText.trim(),
              color: getComputedStyle(element).color,
              contrast: contrast(getComputedStyle(element).color, white),
            })));
        const statuses = [...(doc?.querySelectorAll('.print-source-references .print-status-badge') ?? [])]
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              kind: element.dataset.statusKind,
              foreground: style.color,
              background: style.backgroundColor,
              contrast: contrast(style.color, style.backgroundColor),
            };
          });
        return {
          documentColor: getComputedStyle(doc).color,
          documentBackground: getComputedStyle(doc).backgroundColor,
          headingContrast: heading ? contrast(getComputedStyle(heading).color, white) : 0,
          headings,
          summaryContrast: summaryValue ? contrast(getComputedStyle(summaryValue).color, white) : 0,
          evidenceText,
          sourceLinkContrast: sourceLink ? contrast(getComputedStyle(sourceLink).color, white) : 0,
          statuses,
        };
      })(),
      pageBreaks: [...(doc?.querySelectorAll('.dossier-page-break') ?? [])].map((element) => ({
        display: getComputedStyle(element).display,
        breakBefore: getComputedStyle(element).breakBefore,
      })),
      tables: [...(doc?.querySelectorAll('table') ?? [])].map((table) => {
        const bounds = table.getBoundingClientRect();
        const cellsFit = [...table.querySelectorAll('th, td')].every((cell) => {
          const cellBounds = cell.getBoundingClientRect();
          return cellBounds.left >= bounds.left - 1 && cellBounds.right <= bounds.right + 1 &&
            cell.scrollWidth <= cell.clientWidth + 2;
        });
        return {
          visible: bounds.width > 0 && bounds.height > 0,
          fits: table.scrollWidth <= table.clientWidth + 2 && cellsFit,
        };
      }),
    };
  })()`);
  assert(
    printState.outsideVisibleText.length === 0 &&
      printState.shellSiblingsHidden &&
      printState.noPrintHidden &&
      printState.documentVisible &&
      printState.hierarchy.identity > printState.hierarchy.operations &&
      printState.hierarchy.operations > printState.hierarchy.identifiers &&
      printState.hierarchy.operations > printState.hierarchy.review &&
      printState.colors.documentColor === 'rgb(17, 24, 39)' &&
      printState.colors.documentBackground === 'rgb(255, 255, 255)' &&
      printState.colors.headingContrast >= 7 &&
      printState.colors.headings.length > 0 &&
      printState.colors.headings.every((heading) => heading.contrast >= 4.5) &&
      printState.colors.summaryContrast >= 7 &&
      printState.colors.evidenceText.length > 0 &&
      printState.colors.evidenceText.every((evidence) => evidence.contrast >= 4.5) &&
      printState.colors.sourceLinkContrast >= 4.5 &&
      printState.colors.statuses.length > 0 &&
      printState.colors.statuses.every((status) =>
        status.background !== 'rgba(0, 0, 0, 0)' && status.contrast >= 4.5) &&
      printState.pageBreaks.length > 0 &&
      printState.pageBreaks.every((pageBreak) =>
        pageBreak.display !== 'none' &&
        ['page', 'always'].includes(pageBreak.breakBefore)) &&
      printState.tables.every((table) => table.visible && table.fits),
    `${testCase.category} print media is not legible or exposes unrelated workspace content: ${JSON.stringify(printState)}`,
  );

  const printButtonClicked = await evaluate(cdp, `(() => {
    const modal = document.querySelector('#briefing-dossier-modal-container');
    const button = [...(modal?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.innerText.trim() === 'Print / Save PDF');
    if (!button) return false;
    window.__profilePrintRequested = false;
    window.print = () => { window.__profilePrintRequested = true; };
    button.click();
    return window.__profilePrintRequested === true;
  })()`);
  assert(printButtonClicked, `${testCase.category} brief print action did not request browser printing`);

  const pdfResult = await cdp.send('Page.printToPDF', {
    paperWidth: paperSize.width,
    paperHeight: paperSize.height,
    preferCSSPageSize: false,
    printBackground: true,
    transferMode: 'ReturnAsBase64',
  });
  const pdfPath = path.join(
    pdfDirectory,
    `${testCase.category}-${theme}-${paperSize.name.toLowerCase()}-agency-brief.pdf`,
  );
  await writeFile(pdfPath, Buffer.from(pdfResult.result.data, 'base64'));
  const [{ stdout: pdfInfo }, { stdout: extractedText }] = await Promise.all([
    execFileAsync('pdfinfo', [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
    execFileAsync('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 4 * 1024 * 1024 }),
  ]);
  const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
  const pageSize = pdfInfo.match(/^Page size:\s+(.+)$/m)?.[1] ?? '';
  const pages = extractedText.split('\f').map((page) => page.trim()).filter(Boolean);
  const compactPdfText = extractedText.replace(/\s+/g, '').toLowerCase();
  const normalizedPdfText = extractedText.replace(/\s+/g, ' ').toLowerCase();
  const tableWords = [...new Set(briefDetails.tableCells.flatMap((cell) =>
    cell.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []))];
  const missingTableWords = tableWords.filter((word) => !normalizedPdfText.includes(word));
  assert(
    paperSize.expectedSize.test(pageSize),
    `${testCase.category} PDF is not ${paperSize.name} portrait paper: ${pageSize}`,
  );
  assert(
    pageCount > 0 && pageCount <= 16 && pages.length === pageCount &&
      pages.every((page) => page.trim().length > 0) &&
      pageCount >= printState.pageBreaks.length + 1,
    `${testCase.category} PDF has empty or unexpected pages (${pageCount} pages, ${pages.length} with text)`,
  );
  assert(
    normalizedPdfText.includes(testCase.agency.toLowerCase()) &&
      normalizedPdfText.includes('operations summary') &&
      normalizedPdfText.includes(testCase.operationsLabel.toLowerCase()) &&
      normalizedPdfText.includes('registry ids') &&
      briefDetails.operationsValues.some((value) =>
        normalizedPdfText.includes(value.replace(/\s+/g, ' ').toLowerCase())) &&
      normalizedPdfText.includes('agency source references') &&
      /not marked reviewed|not independent verification/.test(normalizedPdfText),
    `${testCase.category} printed PDF lost agency identity, operations, source heading, or user-review wording`,
  );
  assert(
    briefDetails.tableCells.length > 0 &&
      tableWords.length > 0 &&
      missingTableWords.length / tableWords.length <= 0.05,
    `${testCase.category} printed PDF lost or clipped table content: ${JSON.stringify({
      cellCount: briefDetails.tableCells.length,
      missingWords: missingTableWords.slice(0, 20),
      wordCount: tableWords.length,
    })}`,
  );
  assert(
    briefDetails.references.some((reference) =>
      normalizedPdfText.includes(reference.sourceName.replace(/\s+/g, ' ').toLowerCase()) &&
      normalizedPdfText.includes(reference.period.replace(/\s+/g, ' ').toLowerCase()) &&
      reference.links.some((link) => compactPdfText.includes(link.href.replace(/\s+/g, '').toLowerCase())),
    ),
    `${testCase.category} printed PDF lost its visible source citation, link, or reporting period: ${JSON.stringify({
      expected: briefDetails.references.map(({ sourceName, period, links }) => ({
        sourceName,
        period,
        links: links.map((link) => link.href),
      })),
      pdfSourceText: normalizedPdfText.slice(-1600),
    })}`,
  );
  assert(
    !/interactive u\.s\. territory map|prepare for meeting/i.test(normalizedPdfText),
    `${testCase.category} printed PDF includes unrelated workspace content`,
  );
  await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });
  if (theme === 'daylight' && paperSize.name === 'A4') {
    const paperSizeOptions = await evaluate(cdp, `(() => {
      const select = document.querySelector(
        '#briefing-dossier-modal-container select[aria-label="Direct PDF paper size"]',
      );
      return select ? [...select.options].map((option) => option.value) : [];
    })()`);
    assert(
      paperSizeOptions.includes('a4') && paperSizeOptions.includes('letter'),
      `The direct agency PDF paper-size choices are missing: ${JSON.stringify(paperSizeOptions)}`,
    );

    for (const directPaperSize of printPaperSizes.filter((paper) =>
      !process.env.PROFILE_DIRECT_PAPER ||
      paper.name.toLowerCase() === process.env.PROFILE_DIRECT_PAPER.toLowerCase(),
    )) {
      const selectedValue = directPaperSize.name === 'A4' ? 'a4' : 'letter';
      const selectedPaperSize = await evaluate(cdp, `(() => {
        const select = document.querySelector(
          '#briefing-dossier-modal-container select[aria-label="Direct PDF paper size"]',
        );
        if (!select) return null;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
          .set.call(select, ${JSON.stringify(selectedValue)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return select.value;
      })()`);
      assert(
        selectedPaperSize === selectedValue,
        `Could not select ${directPaperSize.name} for the direct agency PDF`,
      );

      const downloadClicked = await evaluate(cdp, `(() => {
        const button = [...document.querySelectorAll(
          '#briefing-dossier-modal-container button',
        )].find((candidate) => candidate.innerText.trim() === 'Download PDF');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      assert(downloadClicked, 'The direct agency PDF download action was not available');
      const exportCompleted = await waitFor(
        cdp,
        `(() => {
          const text = document.querySelector('#briefing-dossier-modal-container')?.innerText ?? '';
          return text.includes('PDF file saved successfully!') ||
            text.includes('Issue ·');
        })()`,
        `${directPaperSize.name} direct agency PDF export to complete`,
        150_000,
      );
      const exportStatus = await evaluate(
        cdp,
        `document.querySelector('#briefing-dossier-modal-container')?.innerText ?? ''`,
      );
      assert(
        exportCompleted && exportStatus.includes('PDF file saved successfully!'),
        `The direct ${directPaperSize.name} agency PDF export did not complete: ${exportStatus.slice(0, 500)}`,
      );
      const fileName = `${testCase.agency.replace(/[^a-zA-Z0-9]/g, '_')}_ZOLL_Executive_Dossier.pdf`;
      const downloadedPdfPath = await waitForDownloadedFile(downloadDirectory, fileName, 15_000);
      const directPdfPath = path.join(
        pdfDirectory,
        `direct-${directPaperSize.name.toLowerCase()}-agency-brief.pdf`,
      );
      await rename(downloadedPdfPath, directPdfPath);
      const [
        { stdout: directPdfInfo },
        { stdout: directPdfText },
        { stdout: directPdfAnnotations },
      ] = await Promise.all([
        execFileAsync('pdfinfo', [directPdfPath], { maxBuffer: 2 * 1024 * 1024 }),
        execFileAsync('pdftotext', ['-layout', directPdfPath, '-'], { maxBuffer: 4 * 1024 * 1024 }),
        execFileAsync('pdfinfo', ['-url', directPdfPath], { maxBuffer: 2 * 1024 * 1024 }),
      ]);
      const directPageCount = Number(directPdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
      const directPageSize = directPdfInfo.match(/^Page size:\s+(.+)$/m)?.[1] ?? '';
      const directPages = directPdfText.split('\f').map((page) => page.trim()).filter(Boolean);
      const directNormalizedText = directPdfText.replace(/\s+/g, ' ').toLowerCase();
      const directCompactText = directPdfText.replace(/\s+/g, '').toLowerCase();
      const expectedSource = briefDetails.references.find((reference) => reference.links.length > 0);
      const expectedSourceUrls = [...new Set(
        briefDetails.references.flatMap((reference) => reference.links.map((link) => link.href)),
      )];
      const directAnnotationTargets = directPdfAnnotations
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().split(/\s+/).slice(2).join(' '))
        .filter(Boolean);
      const missingSourceAnnotations = expectedSourceUrls.filter((url) =>
        !directAnnotationTargets.includes(url));
      const containsWords = (value) => value.toLowerCase().split(/\s+/)
        .filter(Boolean)
        .every((word) => directCompactText.includes(word.replace(/[^a-z0-9]/g, '')));
      const directExportChecks = {
        selectedPaperSize: selectedValue,
        pageSizeMatchesChoice: directPaperSize.expectedSize.test(directPageSize),
        pageCount: directPageCount,
        pageTextCount: directPages.length,
        allPagesHaveText: directPages.every((page) => page.length > 0),
        agency: containsWords(testCase.agency),
        operations: containsWords(testCase.operationsLabel),
        sourceName: Boolean(expectedSource &&
          containsWords(expectedSource.sourceName)),
        sourceLink: Boolean(expectedSource && expectedSource.links.some((link) =>
          directCompactText.includes(link.href.replace(/\s+/g, '').toLowerCase()))),
        sourceAnnotations: expectedSourceUrls.length > 0 && missingSourceAnnotations.length === 0,
        missingSourceAnnotations,
        sourceNameExpected: expectedSource?.sourceName ?? '',
        sourceUrlExpected: expectedSource?.links[0]?.href ?? '',
        textSample: directNormalizedText.slice(-900),
      };
      assert(
        directExportChecks.pageSizeMatchesChoice &&
          directPageCount > 0 && directPageCount <= 16 &&
          directPages.length === directPageCount &&
          directExportChecks.allPagesHaveText &&
          directExportChecks.agency &&
          directExportChecks.operations &&
          directExportChecks.sourceName &&
          directExportChecks.sourceLink &&
          directExportChecks.sourceAnnotations,
        `Direct ${directPaperSize.name} agency PDF lost its selected page size, readable pagination, agency details, visible source links, or clickable source annotations: ${JSON.stringify(directExportChecks)}`,
      );
      console.log(
        `✓ Direct agency PDF / ${testCase.category} / ${directPaperSize.name}: ${directPageCount} non-empty page(s), source link annotations and agency details retained`,
      );
    }
  }
  console.log(
    `✓ ${testCase.category} / ${theme} / ${paperSize.name}: ${pageCount} non-empty page(s), contrast, page breaks, agency details, and linked source periods retained`,
  );
}

async function checkFieldRoutePrint(cdp, pdfDirectory) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      Boolean([...document.querySelectorAll('button')].find((button) =>
        button.innerText.trim() === 'Agencies'))`,
    'the app shell before preparing a field route print check',
    60_000,
  );

  const openedFieldWork = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      /^Field\\s*Work(?:\\s*\\d+)?$/i.test(candidate.innerText.trim()));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(openedFieldWork, 'Could not open Field Work for the print check');
  await waitFor(
    cdp,
    `document.querySelectorAll('#field-route-sheet .field-route-stop').length > 1`,
    'multiple existing agencies in the field route sheet',
  );
  const routeStops = await evaluate(cdp, `[
    ...document.querySelectorAll('#field-route-sheet .field-route-stop'),
  ].map((stop) => {
    const heading = stop.querySelector('h3');
    const infoBlock = heading?.parentElement?.parentElement;
    const addressTarget = infoBlock?.querySelector(':scope > div:nth-child(2)');
    const contact = infoBlock?.querySelector(':scope > div:nth-child(3)');
    return {
      name: heading?.innerText.trim() ?? '',
      score: stop.querySelector('.field-route-score')?.innerText.trim() ?? '',
      address: [...(addressTarget?.querySelectorAll('span') ?? [])]
        .find((span) => !span.hasAttribute('aria-hidden'))?.innerText.trim() ?? '',
      target: addressTarget?.querySelector('strong')?.innerText.trim() ?? '',
      contact: contact?.querySelector('span.font-semibold')?.innerText.trim() ?? '',
    };
  })`);
  assert(
    routeStops.length > 1 &&
      routeStops.every((stop) => stop.name && stop.score && stop.address && stop.target && stop.contact),
    `The field route print check needs multiple complete route stops: ${JSON.stringify(routeStops)}`,
  );

  for (const theme of ['daylight', 'dark', 'miami-vice']) {
    await setPrintTheme(cdp, theme);
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    const printState = await evaluate(cdp, `(() => {
      const sheet = document.querySelector('#field-route-sheet');
      if (!sheet) return null;
      const rgb = (color) => (color.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (color) => {
        const channels = rgb(color).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const contrast = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const visibleStops = [...sheet.querySelectorAll('.field-route-stop')];
      const score = sheet.querySelector('.field-route-score');
      const scoreStyle = score ? getComputedStyle(score) : null;
      const nonWhiteSurfaces = [...sheet.querySelectorAll('*')]
        .filter((element) => !element.classList.contains('field-route-score'))
        .filter((element) => {
          const color = getComputedStyle(element).backgroundColor;
          return color !== 'rgba(0, 0, 0, 0)' && color !== 'rgb(255, 255, 255)';
        })
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className).slice(0, 120),
          text: element.innerText.trim().slice(0, 80),
          background: getComputedStyle(element).backgroundColor,
        }));
      return {
        sheetVisible: getComputedStyle(sheet).display !== 'none' &&
          getComputedStyle(sheet).visibility !== 'hidden',
        printNavigationHidden: getComputedStyle(document.querySelector('nav[aria-label="Field Work views"]')).display === 'none',
        text: sheet.innerText,
        stopCount: visibleStops.length,
        stopsAvoidBreak: visibleStops.every((stop) =>
          ['avoid', 'avoid-page'].includes(getComputedStyle(stop).breakInside)),
        scoreContrast: scoreStyle ? contrast(scoreStyle.color, scoreStyle.backgroundColor) : 0,
        scoreBackground: scoreStyle?.backgroundColor ?? '',
        nonWhiteSurfaces,
        printButtonsHidden: [...sheet.querySelectorAll('button')].every((button) =>
          getComputedStyle(button).display === 'none'),
      };
    })()`);
    assert(
      printState?.sheetVisible &&
        printState.printNavigationHidden &&
        printState.stopCount === routeStops.length &&
        printState.stopsAvoidBreak &&
        printState.scoreContrast >= 4.5 &&
        printState.scoreBackground === 'rgb(219, 234, 254)' &&
        printState.nonWhiteSurfaces.length === 0 &&
        printState.printButtonsHidden,
      `Field route print styling failed in ${theme}: ${JSON.stringify(printState)}`,
    );

    for (const paperSize of printPaperSizes) {
      const pdfResult = await cdp.send('Page.printToPDF', {
        paperWidth: paperSize.width,
        paperHeight: paperSize.height,
        preferCSSPageSize: false,
        printBackground: true,
        transferMode: 'ReturnAsBase64',
      });
      const pdfPath = path.join(
        pdfDirectory,
        `field-route-${theme}-${paperSize.name.toLowerCase()}.pdf`,
      );
      await writeFile(pdfPath, Buffer.from(pdfResult.result.data, 'base64'));
      const [{ stdout: pdfInfo }, { stdout: extractedText }] = await Promise.all([
        execFileAsync('pdfinfo', [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
        execFileAsync('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 4 * 1024 * 1024 }),
      ]);
      const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
      const pageSize = pdfInfo.match(/^Page size:\s+(.+)$/m)?.[1] ?? '';
      const normalizedPdfText = extractedText.replace(/\s+/g, ' ').toLowerCase();
      assert(
        paperSize.expectedSize.test(pageSize) &&
          pageCount > 0 && pageCount <= 6 &&
          routeStops.every((stop) => [
            stop.name,
            stop.score,
            stop.address,
            stop.target,
            stop.contact,
          ].every((detail) => normalizedPdfText.includes(detail.replace(/\s+/g, ' ').toLowerCase()))) &&
          normalizedPdfText.includes('google maps lookup') &&
          !normalizedPdfText.includes('field clinical & financial battlecards'),
        `Field route ${paperSize.name} PDF lost content, printed unrelated panels, or paginated unexpectedly in ${theme}: ${pageCount} pages (${pageSize})`,
      );
      console.log(
        `✓ Field Work / ${theme} / ${paperSize.name}: ${pageCount} non-empty page(s), route details and status colors retained`,
      );
    }
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });
  }
}

async function assertNoHorizontalOverflow(cdp, width, area) {
  const dimensions = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const workspace = document.querySelector('[data-testid="panel-agency-source-workspace"]');
    const correctionForm = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    const root = document.documentElement;
    const areaName = ${JSON.stringify(area)};
    const measured = areaName === 'drawer'
      ? drawer
      : areaName === 'workspace'
        ? workspace
        : areaName === 'correction form'
          ? correctionForm
          : profile;
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

async function checkCompactProfileLayoutAtViewport(cdp, viewport, providerCategory, agencyName) {
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
      Boolean([...document.querySelectorAll('button')].find((button) =>
        button.innerText.trim() === 'Agencies'))`,
    `the app shell at ${viewport.width}px`,
    60_000,
  );
  await openAgencyProfile(cdp, providerCategory, agencyName);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="profile-bottom-details"]')?.querySelector(
      '[data-testid^="panel-profile-review-"]'
    ))`,
    'the supplemental profile details at the end of the profile',
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

  const summary = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const executiveHeader = profile?.querySelector('[aria-label="Account 360 Executive Decision Header"]');
    const bottomDetails = profile?.querySelector('[data-testid="profile-bottom-details"]');
    const topicNavigation = profile?.querySelector('[data-testid="profile-topic-navigation"]');
    const baseline = profile?.querySelector('[data-testid="agency-operational-baseline"]');
    const title = executiveHeader?.querySelector('h1');
    const summaryGrid = executiveHeader?.querySelector('.profile-summary-grid');
    const overview = profile?.querySelector('[data-testid="agency-intelligence-overview"]');
    const operationsLead = baseline?.querySelector('[data-testid="baseline-operational-metrics"]')
      ?.innerText.trim() ?? '';
    const summaries = [
      ['identity', executiveHeader?.querySelector('h1')],
      ['baseline', baseline],
      ['sources', profile?.querySelector('[aria-label="Available source references"]')],
    ];
    const positions = summaries.map(([label, element]) => {
      if (!element) return { label, present: false };
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        label,
        present: true,
        visible: bounds.width > 0 && bounds.height > 0 &&
          style.visibility !== 'hidden' && style.display !== 'none',
        fits: element.scrollWidth <= element.clientWidth + 1,
      };
    });
    const labels = [
      'Agency contact summary',
      'Available source references',
    ];
    const panels = labels.map((label) => {
      const matches = profile?.querySelectorAll('[aria-label="' + label + '"]') ?? [];
      const panel = matches[0];
      const bounds = panel?.getBoundingClientRect();
      const style = panel && getComputedStyle(panel);
      return {
        label,
        count: matches.length,
        hasHeading: Boolean(panel?.querySelector('h2')),
        hasContent: Boolean(panel?.innerText.trim()),
        visible: Boolean(bounds && bounds.width > 0 && bounds.height > 0 &&
          style?.visibility !== 'hidden' && style?.display !== 'none'),
        fits: Boolean(panel && panel.scrollWidth <= panel.clientWidth + 1),
      };
    });
    return {
      title: title?.innerText.trim() ?? '',
      regionCounts: {
        profileWorkspaces: document.querySelectorAll('main.profile-workspace').length,
        executiveHeaders: profile?.querySelectorAll('[aria-label="Account 360 Executive Decision Header"]').length ?? 0,
        topicNavigations: profile?.querySelectorAll('[data-testid="profile-topic-navigation"]').length ?? 0,
        overviewPanels: profile?.querySelectorAll('[data-testid="agency-intelligence-overview"]').length ?? 0,
        operationalBaselines: profile?.querySelectorAll('[data-testid="agency-operational-baseline"]').length ?? 0,
        contactSummaries: profile?.querySelectorAll('[aria-label="Agency contact summary"]').length ?? 0,
        sourceSummaries: profile?.querySelectorAll('[aria-label="Available source references"]').length ?? 0,
        bottomDetailsHosts: profile?.querySelectorAll('[data-testid="profile-bottom-details"]').length ?? 0,
      },
      overviewPanelStates: [...(profile?.querySelectorAll(
        '[data-testid="agency-intelligence-overview"] [data-testid^="button-toggle-"]',
      ) ?? [])].map((button) => button.getAttribute('aria-expanded')),
      overviewPanelSummaries: [...(overview?.querySelectorAll('[data-testid^="summary-"]') ?? [])]
        .map((summary) => summary.innerText.trim()),
      repeatedPrimaryOperations: Boolean(operationsLead && overview?.innerText.includes(operationsLead)),
      selectedTopicButtons: [...(topicNavigation?.querySelectorAll('button') ?? [])]
        .filter((button) => button.className.includes('bg-[#285EE8]'))
        .map((button) => button.innerText.trim()),
      mobileTopicValue: profile?.querySelector('[data-testid="select-profile-section-mobile"]')?.value ?? null,
      identityCount: executiveHeader?.querySelectorAll('h1').length ?? 0,
      summaryGridCount: executiveHeader?.querySelectorAll('.profile-summary-grid').length ?? 0,
      summaryPanelCount: summaryGrid?.querySelectorAll('.profile-summary-panel').length ?? 0,
      operationsLead,
      identityBeforeBaseline: Boolean(executiveHeader && baseline &&
        (executiveHeader.compareDocumentPosition(baseline) & Node.DOCUMENT_POSITION_FOLLOWING)),
      baselineBeforeTopicNavigation: Boolean(baseline && topicNavigation &&
        (baseline.compareDocumentPosition(topicNavigation) & Node.DOCUMENT_POSITION_FOLLOWING)),
      bottomDetailsLabels: [...(bottomDetails?.querySelectorAll('summary') ?? [])]
        .map((summary) => summary.innerText.trim()),
      bottomReviewAction: bottomDetails?.querySelector('[data-testid^="button-mark-profile-reviewed-"]')
        ?.innerText.trim() ?? '',
      detailsAfterTopicNavigation: Boolean(topicNavigation && bottomDetails &&
        (topicNavigation.compareDocumentPosition(bottomDetails) & Node.DOCUMENT_POSITION_FOLLOWING)),
      headerContainsDeferredSections: Boolean(executiveHeader?.innerText.includes(
        'Registry identifiers and verification'
      ) || executiveHeader?.innerText.includes('Planning scores and estimates') ||
        executiveHeader?.innerText.includes('Assessment and planning context') ||
        executiveHeader?.innerText.includes('I reviewed these details')),
      positions,
      panels,
    };
  })()`);
  assert(
    summary?.title === agencyName &&
      Object.values(summary.regionCounts).every((count) => count === 1) &&
      summary.identityCount === 1 &&
      summary.summaryGridCount === 1 &&
      summary.summaryPanelCount === 2 &&
      summary.operationsLead.length > 0 &&
      summary.identityBeforeBaseline &&
      summary.baselineBeforeTopicNavigation &&
      summary.bottomDetailsLabels.includes('Registry identifiers and verification') &&
      summary.bottomDetailsLabels.includes('Planning scores and estimates') &&
      summary.bottomDetailsLabels.includes('Assessment and planning context') &&
      summary.bottomReviewAction.includes('I reviewed these details') &&
      summary.detailsAfterTopicNavigation &&
      !summary.headerContainsDeferredSections &&
      summary.overviewPanelStates.length > 0 &&
      summary.overviewPanelStates.every((expanded) => expanded === 'false') &&
      !summary.repeatedPrimaryOperations &&
      summary.overviewPanelSummaries.some((value) => value === 'Station locations and apparatus details') &&
      summary.overviewPanelSummaries.some((value) => value === 'Call volume and service-area details') &&
      summary.positions.every((item) => item.present && item.visible && item.fits) &&
      summary.panels.every((panel) =>
        panel.count === 1 && panel.hasHeading && panel.hasContent && panel.visible && panel.fits),
    `${providerCategory.toUpperCase()} compact profile summary regressed at ${viewport.width}px for ${agencyName}: ${JSON.stringify(summary)}`,
  );
  const overviewPanelToggle = await evaluate(cdp, `(() => {
    const button = document.querySelector(
      '[data-testid="agency-intelligence-overview"] [data-testid="button-toggle-identity"]',
    );
    button?.click();
    return Boolean(button);
  })()`);
  assert(overviewPanelToggle, `The ${providerCategory} identity details did not expand at ${viewport.width}px`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="agency-intelligence-overview"] [data-testid="button-toggle-identity"]')
      ?.getAttribute('aria-expanded') === 'true'`,
    'the identity details to expand',
  );
  await evaluate(cdp, `document.querySelector(
    '[data-testid="agency-intelligence-overview"] [data-testid="button-toggle-identity"]',
  )?.click()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="agency-intelligence-overview"] [data-testid="button-toggle-identity"]')
      ?.getAttribute('aria-expanded') === 'false'`,
    'the identity details to collapse again',
  );
  const topicSwitch = await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (select) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        ?.set?.call(select, 'equipment');
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      [...document.querySelectorAll('[data-testid="profile-topic-navigation"] button')]
        .find((button) => button.innerText.trim() === '2. Equipment & Tech')
        ?.click();
    }
    return true;
  })()`);
  assert(topicSwitch, `Could not switch the ${providerCategory} profile topic at ${viewport.width}px`);
  await waitFor(
    cdp,
    `(() => {
      const profile = document.querySelector('main.profile-workspace');
      return profile?.querySelectorAll('[data-testid="profile-topic-navigation"]').length === 1 &&
        profile?.querySelectorAll('[aria-label="Account 360 Executive Decision Header"]').length === 1 &&
        profile?.querySelectorAll('[data-testid="agency-operational-baseline"]').length === 1 &&
        profile?.querySelectorAll('[aria-label="Agency contact summary"]').length === 1 &&
        profile?.querySelectorAll('[aria-label="Available source references"]').length === 1 &&
        profile?.querySelectorAll('[data-testid="profile-bottom-details"]').length === 1 &&
        profile?.querySelectorAll('[data-testid="agency-intelligence-overview"]').length === 0 &&
        /Equipment|Technology/.test(profile?.innerText || '');
    })()`,
    'the equipment topic to replace the overview while keeping each profile summary singular',
  );
  await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (select) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        ?.set?.call(select, 'overview');
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      [...document.querySelectorAll('[data-testid="profile-topic-navigation"] button')]
        .find((button) => button.innerText.trim() === '1. Overview')
        ?.click();
    }
  })()`);
  await waitFor(
    cdp,
    `(() => {
      const profile = document.querySelector('main.profile-workspace');
      return profile?.querySelectorAll('[data-testid="agency-intelligence-overview"]').length === 1 &&
        profile?.querySelectorAll('[data-testid="agency-operational-baseline"]').length === 1 &&
        profile?.querySelectorAll('[aria-label="Agency contact summary"]').length === 1 &&
        profile?.querySelectorAll('[aria-label="Available source references"]').length === 1;
    })()`,
    'the overview topic to return with each summary exactly once',
  );
  if (viewport.width === 390 || viewport.width === 1024 || viewport.width === 1280) {
    await evaluate(cdp, `document.querySelector('.provider-profile-overlay')?.scrollTo({ top: 0 })`);
    const profileScreenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      `/tmp/ems-${providerCategory}-profile-top-${viewport.width}.png`,
      Buffer.from(profileScreenshot.result.data, 'base64'),
    );
    await evaluate(cdp, `document.querySelector('[data-testid="profile-bottom-details"]')
      ?.scrollIntoView({ block: 'start' })`);
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      `/tmp/ems-${providerCategory}-profile-bottom-${viewport.width}.png`,
      Buffer.from(screenshot.result.data, 'base64'),
    );
  }

  const toolbar = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const dock = profile?.querySelector('[data-testid="profile-primary-actions"]');
    if (!dock) return null;
    dock.scrollIntoView({ block: 'start', inline: 'nearest' });
    const primary = dock.querySelector('[aria-label="Prepare for meeting"]');
    const moreActions = dock.querySelector('.profile-more-actions');
    const moreSummary = moreActions?.querySelector(':scope > summary');
    if (!primary || !moreActions || !moreSummary) return { missingPrimaryOrDisclosure: true };
    const layoutControls = [primary, moreSummary].filter((control) => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return rect.width > 0 && rect.height > 0 &&
        style.visibility !== 'hidden' && style.display !== 'none';
    });
    const secondarySelectors = [
      '[aria-label="Inspect agency sources"]',
      '[aria-label="Add agency to route"], [aria-label^="Remove agency from"]',
      '[aria-label="Save agency to My Work"], [aria-label="Remove agency from saved work"]',
      '[data-testid="button-profile-print-brief"]',
    ];
    const secondaryActions = secondarySelectors.map((selector) =>
      moreActions.querySelector(selector));
    if (secondaryActions.some((action) => !action)) return { missingSecondaryAction: true };
    const dockStyle = getComputedStyle(dock);
    const dockBounds = dock.getBoundingClientRect();
    const overlay = document.querySelector('.provider-profile-overlay');
    const bottomNav = document.querySelector('.pi-mobile-nav');
    const primaryActionVisible = layoutControls.length === 2;
    const aligned = primaryActionVisible &&
      Math.max(...layoutControls.map((control) => control.getBoundingClientRect().top)) -
        Math.min(...layoutControls.map((control) => control.getBoundingClientRect().top)) <= 3;
    const noPageOverflow = document.documentElement.scrollWidth <= innerWidth + 1;
    moreActions.open = true;
    const secondaryActionsVisible = secondaryActions.every((action) => {
      const rect = action.getBoundingClientRect();
      const style = getComputedStyle(action);
      return rect.width > 0 && rect.height > 0 &&
        style.visibility !== 'hidden' && style.display !== 'none';
    });
    const menu = moreActions.querySelector('.profile-more-actions-menu');
    const menuBounds = menu?.getBoundingClientRect();
    const menuInsideViewport = Boolean(menuBounds && menuBounds.left >= -1 &&
      menuBounds.right <= innerWidth + 1 && menuBounds.top >= -1 &&
      menuBounds.bottom <= innerHeight + 1);
    const menuGeometry = menuBounds
      ? { left: menuBounds.left, right: menuBounds.right, top: menuBounds.top, bottom: menuBounds.bottom }
      : null;
    const controlTops = layoutControls.map((control) => control.getBoundingClientRect().top);
    const secondaryGeometry = secondaryActions.map((action) => {
      const rect = action.getBoundingClientRect();
      return { label: action.getAttribute('aria-label') || action.innerText.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    if (innerWidth >= 768) {
      const initialActionsReachable = layoutControls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left >= dockBounds.left - 1 && rect.right <= dockBounds.right + 1;
      });
      const secondaryActionsReachable = secondaryActions.every((action) => {
        const rect = action.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1 &&
          rect.top >= -1 && rect.bottom <= innerHeight + 1;
      });
      moreActions.open = false;
      return {
        mode: 'laptop',
        flexWrap: dockStyle.flexWrap,
        aligned,
        noPageOverflow,
        initialActionsReachable,
        secondaryActionsVisible,
        secondaryActionsReachable,
        menuInsideViewport,
        menuGeometry,
        controlTops,
        secondaryGeometry,
      };
    }

    if (!overlay || !bottomNav) return { missingMobileShell: true };
    dock.scrollIntoView({ block: 'start', inline: 'nearest' });
    overlay.scrollTop += Math.max(0, dock.getBoundingClientRect().top - 88);
    const bounds = dock.getBoundingClientRect();
    const navBounds = bottomNav.getBoundingClientRect();
    const sticky = getComputedStyle(dock).position === 'sticky';
    const insideViewport = bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
      bounds.top >= -1 && bounds.top < innerHeight;
    const clearOfBottomNav = bounds.bottom <= navBounds.top - 1;
    const initialActionsReachable = layoutControls.every((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
    const secondaryActionsReachable = secondaryActions.every((action) => {
      const rect = action.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1 &&
        rect.bottom > 0 && rect.top < navBounds.top;
    });
    moreActions.open = false;
    return {
      mode: 'phone',
      sticky,
      insideViewport,
      clearOfBottomNav,
      initialActionsReachable,
      secondaryActionsVisible,
      secondaryActionsReachable,
      menuInsideViewport,
      menuGeometry,
      controlTops,
      secondaryGeometry,
    };
  })()`);
  if (viewport.width >= 768) {
    assert(
      toolbar?.mode === 'laptop' &&
        toolbar.flexWrap === 'nowrap' &&
        toolbar.aligned &&
        toolbar.noPageOverflow &&
        toolbar.initialActionsReachable &&
        toolbar.secondaryActionsVisible &&
        toolbar.secondaryActionsReachable &&
        toolbar.menuInsideViewport,
      `Profile laptop primary action or secondary-action menu is not usable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(toolbar)}`,
    );
  } else {
    assert(
      toolbar?.mode === 'phone' &&
        toolbar.sticky &&
        toolbar.insideViewport &&
        toolbar.clearOfBottomNav &&
        toolbar.initialActionsReachable &&
        toolbar.secondaryActionsVisible &&
        toolbar.secondaryActionsReachable &&
        toolbar.menuInsideViewport,
      `Profile phone primary action or secondary-action menu is not usable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(toolbar)}`,
    );
  }
  if (viewport.width === 1280) {
    const backToDirectory = await evaluate(cdp, `(() => {
      const button = document.querySelector('[data-testid="profile-back-button"]');
      button?.click();
      return Boolean(button);
    })()`);
    assert(backToDirectory, `Could not leave the ${providerCategory} profile before changing agencies`);
    await waitFor(
      cdp,
      `!document.querySelector('main.profile-workspace')`,
      'the agency profile to close before switching records',
    );
    const nextAgencyName = providerCategory === 'fire' ? fireProfileCases[1] : emsProfileCases[1];
    await openAgencyProfile(cdp, providerCategory, nextAgencyName);
    const nextAgencyChecks = await evaluate(cdp, `(() => {
      const profile = document.querySelector('main.profile-workspace');
      return {
        title: profile?.querySelector('[aria-label="Account 360 Executive Decision Header"] h1')?.innerText.trim(),
        previousAgencyStillVisible: profile?.innerText.includes(${JSON.stringify(agencyName)}) ?? false,
        profileCount: document.querySelectorAll('main.profile-workspace').length,
        headerCount: profile?.querySelectorAll('[aria-label="Account 360 Executive Decision Header"]').length ?? 0,
        topicCount: profile?.querySelectorAll('[data-testid="profile-topic-navigation"]').length ?? 0,
        overviewCount: profile?.querySelectorAll('[data-testid="agency-intelligence-overview"]').length ?? 0,
        baselineCount: profile?.querySelectorAll('[data-testid="agency-operational-baseline"]').length ?? 0,
        contactSummaryCount: profile?.querySelectorAll('[aria-label="Agency contact summary"]').length ?? 0,
        sourceSummaryCount: profile?.querySelectorAll('[aria-label="Available source references"]').length ?? 0,
        bottomDetailsCount: profile?.querySelectorAll('[data-testid="profile-bottom-details"]').length ?? 0,
      };
    })()`);
    assert(
      nextAgencyChecks.title === nextAgencyName &&
        !nextAgencyChecks.previousAgencyStillVisible &&
        nextAgencyChecks.profileCount === 1 &&
        nextAgencyChecks.headerCount === 1 &&
        nextAgencyChecks.topicCount === 1 &&
        nextAgencyChecks.overviewCount === 1 &&
        nextAgencyChecks.baselineCount === 1 &&
        nextAgencyChecks.contactSummaryCount === 1 &&
        nextAgencyChecks.sourceSummaryCount === 1 &&
        nextAgencyChecks.bottomDetailsCount === 1,
      `${providerCategory.toUpperCase()} profile retained or duplicated content after changing agencies: ${JSON.stringify(nextAgencyChecks)}`,
    );
  }
  console.log(
    `✓ ${viewport.width}px: ${providerCategory.toUpperCase()} compact identity/baseline/sources and ${toolbar.mode} action dock (${agencyName})`,
  );
}

async function checkMapPaletteAtViewport(cdp, viewport) {
  await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    if (!metric) return false;
    metric.value = 'cardiac-survival';
    metric.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-state-map-metric"]')?.value === 'cardiac-survival' &&
      Boolean(document.querySelector('[data-testid="select-map-color-palette"]'))`,
    `the quality-map palette control at ${viewport.width}px`,
  );
  await evaluate(cdp, `(() => {
    const palette = document.querySelector('[data-testid="select-map-color-palette"]');
    if (!palette) return false;
    palette.value = 'standard';
    palette.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('.home-map-svg')?.dataset.mapPalette === 'standard'`,
    `the standard cardiac-survival palette at ${viewport.width}px`,
  );
  const controlLayout = await evaluate(cdp, `(() => {
    const control = document.querySelector('[data-testid="select-map-color-palette"]');
    const stage = document.querySelector('.home-map-stage-v2');
    if (!control || !stage) return null;
    const bounds = control.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    return {
      visible: bounds.width > 0 && bounds.height > 0,
      insideStage: bounds.left >= stageBounds.left - 1 && bounds.right <= stageBounds.right + 1,
      label: control.closest('label')?.innerText.trim() ?? '',
    };
  })()`);
  assert(
    controlLayout?.visible &&
      controlLayout.insideStage &&
      controlLayout.label.toLowerCase().startsWith('map palette'),
    `Color palette control is clipped or unclear at ${viewport.width}px: ${JSON.stringify(controlLayout)}`,
  );
  const standardFill = await evaluate(cdp, `document.querySelector('.home-map-state-path[aria-pressed="true"]')?.getAttribute('fill') ?? null`);
  await evaluate(cdp, `(() => {
    const palette = document.querySelector('[data-testid="select-map-color-palette"]');
    if (!palette) return false;
    palette.value = 'colorblind-safe';
    palette.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('.home-map-svg')?.dataset.mapPalette === 'colorblind-safe'`,
    `the color-blind-safe cardiac-survival palette at ${viewport.width}px`,
  );
  const safeCardiac = await evaluate(cdp, `(() => {
    const selected = document.querySelector('.home-map-state-path[aria-pressed="true"]');
    const statePaths = [...document.querySelectorAll('.home-map-state-path')];
    const fills = statePaths.map((path) => path.getAttribute('fill'))
      .filter((color) => /^#[0-9a-f]{6}$/i.test(color ?? ''));
    const luminance = (hex) => {
      const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
      const [red, green, blue] = channels.map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const mapBackground = luminance('#081521');
    const contrast = fills.map((color) => {
      const value = luminance(color);
      return (Math.max(value, mapBackground) + 0.05) / (Math.min(value, mapBackground) + 0.05);
    });
    const endpoints = [...document.querySelectorAll('.home-map-legend-endpoint')];
    const fillForEndpoint = (endpoint) => {
      const value = endpoint?.innerText.split(' · ')[0].trim();
      return statePaths.find((path) => path.getAttribute('aria-label')?.includes(': ' + value + '.'))
        ?.getAttribute('fill') ?? null;
    };
    const lowFill = fillForEndpoint(endpoints[0]);
    const highFill = fillForEndpoint(endpoints[1]);
    const missingLegend = document.querySelector('.home-map-legend-missing');
    const missingSwatch = missingLegend?.querySelector('span');
    return {
      fill: selected?.getAttribute('fill') ?? null,
      selectedStroke: selected?.getAttribute('stroke') ?? null,
      selectedOuterOutline: [...(selected?.parentElement?.querySelectorAll('path') ?? [])]
        .some((path) => path.getAttribute('stroke') === '#F4C86A'),
      stateFillCount: fills.length,
      minimumContrast: contrast.length ? Math.min(...contrast) : 0,
      lowEndpointLuminance: lowFill ? luminance(lowFill) : null,
      highEndpointLuminance: highFill ? luminance(highFill) : null,
      gradientVisible: Boolean(document.querySelector('.home-map-legend-gradient')?.getBoundingClientRect().width),
      legend: document.querySelector('.home-map-legend-v2')?.innerText ?? '',
      missingText: missingLegend?.innerText.trim() ?? '',
      missingHatch: missingSwatch?.className.includes('repeating-linear-gradient') ?? false,
      missingPattern: Boolean(document.querySelector('#home-map-missing-data')),
      savedPalette: sessionStorage.getItem('ems-map-palette'),
    };
  })()`);
  assert(
    safeCardiac.fill && safeCardiac.fill !== standardFill &&
      safeCardiac.stateFillCount > 0 &&
      safeCardiac.minimumContrast >= 3,
    `The safe cardiac palette is not distinct or has insufficient map contrast at ${viewport.width}px: ${JSON.stringify(safeCardiac)}`,
  );
  assert(
    safeCardiac.legend.includes('Cardiac survival estimate') &&
      safeCardiac.legend.includes('Color-blind safe') &&
      safeCardiac.legend.includes('Lower') &&
      safeCardiac.legend.includes('Higher') &&
      safeCardiac.gradientVisible &&
      safeCardiac.lowEndpointLuminance < safeCardiac.highEndpointLuminance &&
      safeCardiac.missingText === 'Not reported' &&
      safeCardiac.missingHatch &&
      safeCardiac.missingPattern &&
      safeCardiac.selectedStroke === '#F4C86A' &&
      safeCardiac.selectedOuterOutline &&
      safeCardiac.savedPalette === 'colorblind-safe',
    `The safe cardiac legend, missing-data hatch, selected outline, or saved setting is unclear at ${viewport.width}px: ${JSON.stringify(safeCardiac)}`,
  );
  await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    if (!metric) return false;
    metric.value = 'scene-transit';
    metric.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-state-map-metric"]')?.value === 'scene-transit' &&
      document.querySelector('.home-map-svg')?.dataset.mapPalette === 'colorblind-safe'`,
    `the color-blind-safe scene-transit palette at ${viewport.width}px`,
  );
  const safeTransit = await evaluate(cdp, `(() => {
    const selected = document.querySelector('.home-map-state-path[aria-pressed="true"]');
    const statePaths = [...document.querySelectorAll('.home-map-state-path')];
    const luminance = (hex) => {
      const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
      const [red, green, blue] = channels.map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const endpoints = [...document.querySelectorAll('.home-map-legend-endpoint')];
    const fillForEndpoint = (endpoint) => {
      const value = endpoint?.innerText.split(' · ')[0].trim();
      return statePaths.find((path) => path.getAttribute('aria-label')?.includes(': ' + value + '.'))
        ?.getAttribute('fill') ?? null;
    };
    const lowFill = fillForEndpoint(endpoints[0]);
    const highFill = fillForEndpoint(endpoints[1]);
    return {
      selectedStroke: selected?.getAttribute('stroke') ?? null,
      lowEndpointLuminance: lowFill ? luminance(lowFill) : null,
      highEndpointLuminance: highFill ? luminance(highFill) : null,
      legend: document.querySelector('.home-map-legend-v2')?.innerText ?? '',
    };
  })()`);
  assert(
    safeTransit.lowEndpointLuminance > safeTransit.highEndpointLuminance &&
      safeTransit.legend.includes('EMS transit estimate') &&
      safeTransit.legend.includes('Shorter') &&
      safeTransit.legend.includes('Longer') &&
      safeTransit.legend.includes('Color-blind safe') &&
      safeTransit.selectedStroke === '#F4C86A',
    `Scene-transit palette, legend, or selected outline is unclear at ${viewport.width}px: ${JSON.stringify(safeTransit)}`,
  );
  await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    if (!metric) return false;
    metric.value = 'cardiac-survival';
    metric.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-state-map-metric"]')?.value === 'cardiac-survival' &&
      Boolean(document.querySelector('[data-testid="select-map-color-palette"]'))`,
    `restoring the map palette selector at ${viewport.width}px`,
  );
  await evaluate(cdp, `(() => {
    const palette = document.querySelector('[data-testid="select-map-color-palette"]');
    if (!palette) return false;
    palette.value = 'standard';
    palette.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('.home-map-svg')?.dataset.mapPalette === 'standard'`,
    `restoring the standard map palette at ${viewport.width}px`,
  );
  await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    if (!metric) return false;
    metric.value = 'agency-records';
    metric.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-state-map-metric"]')?.value === 'agency-records' &&
      !document.querySelector('[data-testid="select-map-color-palette"]')`,
    `restoring the standard agency map at ${viewport.width}px`,
  );
}

async function selectHomeMapStateAndReturn(cdp, viewport, stateName) {
  const selected = await evaluate(cdp, `(() => {
    const state = [...document.querySelectorAll('.home-map-state-path')]
      .find((path) => path.getAttribute('aria-label')?.startsWith(${JSON.stringify(`${stateName}.`)}));
    state?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return Boolean(state);
  })()`);
  assert(selected, `Could not select ${stateName} from the Home map at ${viewport.width}px`);
  await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen'))`, `${stateName} county directory`);
  await openPrimaryWorkspace(cdp, 'Map', viewport.mobile ? '.pi-mobile-nav' : '.pi-primary-sidebar');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.home-map-state-path[aria-label^="${stateName}."][aria-pressed="true"]'))`,
    `${stateName} selected on the returning Home map`,
  );
}

function readGzippedJson(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(gunzipSync(readFileSync(filePath)).toString('utf8'));
}

function buildExpectedAcsStateSummaries() {
  const countyFixture = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'scripts/fixtures/census-2026-county-identities.json'), 'utf8'),
  );
  const appCounties = readGzippedJson('artifacts/ems-territory-intelligence/src/data/all-counties-database.json.gz');
  const acsDataset = readGzippedJson('artifacts/ems-territory-intelligence/src/data/acs-county-metrics-2024.json.gz');
  const countyCounts = new Map();
  for (const county of countyFixture.counties) {
    countyCounts.set(county.USPS, (countyCounts.get(county.USPS) ?? 0) + 1);
  }
  const acsByFips = new Map(acsDataset.counties.map((row) => [row.countyFips, row]));
  const countiesByState = new Map();
  for (const county of appCounties) {
    const stateRows = countiesByState.get(county.stateCode) ?? [];
    stateRows.push(acsByFips.get(String(county.countyFips).padStart(5, '0')));
    countiesByState.set(county.stateCode, stateRows);
  }

  const median = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const summaries = new Map();
  for (const [stateCode, rows] of countiesByState) {
    const valid = rows.filter(Boolean);
    const population = valid.reduce((total, row) => total + (row.population ?? 0), 0);
    const ageCount = valid.reduce((total, row) => total + (row.population65Plus ?? 0), 0);
    const povertyUniverse = valid.reduce((total, row) => total + (row.povertyUniverse ?? 0), 0);
    const belowPoverty = valid.reduce((total, row) => total + (row.populationBelowPoverty ?? 0), 0);
    const incomes = valid
      .map((row) => row.medianHouseholdIncome)
      .filter((value) => Number.isFinite(value) && value >= 0);
    summaries.set(stateCode, {
      countyCount: countyCounts.get(stateCode) ?? 0,
      population: { value: population, available: valid.filter((row) => Number.isFinite(row.population)).length },
      age: { value: population ? (ageCount / population) * 100 : null, available: valid.filter((row) => Number.isFinite(row.population65Plus) && row.population > 0).length },
      poverty: { value: povertyUniverse ? (belowPoverty / povertyUniverse) * 100 : null, available: valid.filter((row) => Number.isFinite(row.povertyUniverse) && row.povertyUniverse > 0 && Number.isFinite(row.populationBelowPoverty)).length },
      income: { value: incomes.length ? median(incomes) : null, available: incomes.length },
    });
  }
  return { summaries, reportingPeriod: acsDataset.source.reportingPeriod };
}

async function checkEveryStateMapAtViewport(cdp, viewport, expectedAcs, checkClicks) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, `Home map at ${viewport.width}px`);
  await evaluate(cdp, `(() => {
    const florida = [...document.querySelectorAll('.home-map-state-path')]
      .find((path) => path.getAttribute('aria-label')?.startsWith('Florida.'));
    florida?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return Boolean(florida);
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen .county-selection-title'))`, `Florida county view at ${viewport.width}px`);
  await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('.county-selection-context-row button')]
      .find((candidate) => candidate.innerText.trim() === 'All states');
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen .us-state-path'))`, `national Territory map at ${viewport.width}px`);
  await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="select-state-map-layer"]');
    if (!select) return false;
    select.value = 'agency-records';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-state-map-layer"]')?.value === 'agency-records'`,
    `agency-records layer at ${viewport.width}px`,
  );

  const statePaths = await evaluate(cdp, `(() => [...document.querySelectorAll('.territory-explorer-screen .us-state-path')].map((path) => ({
    name: path.getAttribute('aria-label')?.replace(/^Inspect (.*) counties$/, '$1') ?? '',
    title: path.querySelector('title')?.textContent ?? '',
    fill: path.getAttribute('fill') ?? '',
    role: path.getAttribute('role') ?? '',
    tabIndex: path.getAttribute('tabindex'),
  })))()`);
  const codes = statePaths.map((state) => state.title.match(/^.+? \(([A-Z]{2})\)/)?.[1] ?? '');
  const expectedCodes = [...expectedAcs.summaries.keys()].sort();
  assert(statePaths.length === 51, `Territory map drew ${statePaths.length} states/DC instead of 51`);
  assert(new Set(codes).size === 51 && codes.every(Boolean), `Territory map state codes are missing or duplicated: ${JSON.stringify(codes)}`);
  assert(
    JSON.stringify([...codes].sort()) === JSON.stringify(expectedCodes),
    `Territory map code set differs from county geography: ${JSON.stringify({ codes: [...codes].sort(), expectedCodes })}`,
  );
  for (const state of statePaths) {
    const match = state.title.match(/^(.+?) \(([A-Z]{2})\)/);
    assert(match, `State map path has no state name/code title: ${JSON.stringify(state)}`);
    const [, stateName, stateCode] = match;
    const expected = expectedAcs.summaries.get(stateCode);
    assert(expected, `${stateCode} has no county-backed expected state summary`);
    assert(state.name === stateName, `${stateCode} map accessible label and title disagree: ${JSON.stringify(state)}`);
    assert(state.role === 'button' && state.tabIndex === '0', `${stateCode} map boundary is not keyboard accessible`);
    assert(state.fill && state.fill !== 'url(#us-map-missing-hatch)', `${stateCode} default map fill is missing`);
    const countMatch = state.title.match(/Click to inspect (\d+) (?:legacy county polygons|counties)/);
    assert(Number(countMatch?.[1]) === expected.countyCount, `${stateCode} map county count does not match the Census county identity fixture`);
  }

  const layers = [
    { key: 'acs-population', measure: 'population', format: (value) => Math.round(value).toLocaleString() },
    { key: 'acs-age65-share', measure: 'age', format: (value) => `${value.toFixed(1)}%` },
    { key: 'acs-poverty-rate', measure: 'poverty', format: (value) => `${value.toFixed(1)}%` },
    { key: 'acs-county-income-median', measure: 'income', format: (value) => `$${Math.round(value).toLocaleString()}` },
  ];
  for (const layer of layers) {
    await evaluate(cdp, `(() => {
      const select = document.querySelector('[data-testid="select-state-map-layer"]');
      if (!select) return false;
      select.value = ${JSON.stringify(layer.key)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(cdp, `document.querySelector('[data-testid="select-state-map-layer"]')?.value === ${JSON.stringify(layer.key)}`, `${layer.key} layer`);
    const titles = await evaluate(cdp, `(() => [...document.querySelectorAll('.territory-explorer-screen .us-state-path')].map((path) => ({
      title: path.querySelector('title')?.textContent ?? '',
      ariaLabel: path.getAttribute('aria-label') ?? '',
    })))()`);
    assert(titles.length === 51, `${layer.key} rendered ${titles.length} state/DC titles`);
    for (const item of titles) {
      const match = item.title.match(/^.+? \(([A-Z]{2})\)/);
      const code = match?.[1];
      const expected = code ? expectedAcs.summaries.get(code) : null;
      const metric = expected?.[layer.measure];
      assert(expected && metric, `${layer.key} has no expected value for ${code ?? item.title}`);
      const expectedCoverage = `${metric.available}/${expected.countyCount} county-equivalents`;
      assert(item.title.includes(expectedCoverage), `${layer.key} coverage text is wrong for ${code}: ${item.title}`);
      if (metric.value == null || metric.available !== expected.countyCount) {
        assert(item.title.includes('State value not mapped'), `${layer.key} incomplete state ${code} is not identified as unmapped: ${item.title}`);
      } else {
        assert(item.title.includes(`${expectedAcs.reportingPeriod} ACS`), `${layer.key} reporting period is missing for ${code}: ${item.title}`);
        assert(item.title.includes(layer.format(metric.value)), `${layer.key} state value does not match its county rollup for ${code}: ${item.title}`);
      }
    }
  }

  if (!checkClicks) {
    console.log(`PASS ${viewport.width}×${viewport.height}: 51 state/DC polygons, county counts, accessibility, and four rendered ACS layers`);
    return;
  }
  const countiesByCode = new Map(expectedAcs.summaries);
  for (const state of statePaths) {
    const { stateCode, stateName } = (() => {
      const match = state.title.match(/^(.+?) \(([A-Z]{2})\)/);
      return { stateName: match?.[1], stateCode: match?.[2] };
    })();
    await evaluate(cdp, `(() => {
      const path = [...document.querySelectorAll('.territory-explorer-screen .us-state-path')]
        .find((candidate) => candidate.querySelector('title')?.textContent.startsWith(${JSON.stringify(`${stateName} (${stateCode})`)}));
      path?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return Boolean(path);
    })()`);
    await waitFor(
      cdp,
      `document.querySelector('.county-selection-title')?.innerText.trim() === ${JSON.stringify(stateName)}`,
      `${stateName} county drill-down`,
    );
    const selected = await evaluate(cdp, `(() => ({
      name: document.querySelector('.county-selection-title')?.innerText.trim() ?? '',
      count: document.querySelector('.county-selection-meta strong')?.innerText.trim() ?? '',
      heading: document.querySelector('.county-selection-meta')?.innerText ?? '',
    }))()`);
    assert(
      selected.name === stateName &&
        Number(selected.count.replaceAll(',', '')) === countiesByCode.get(stateCode)?.countyCount &&
        selected.heading.includes('counties'),
      `${stateCode} state drill-down does not match its county records: ${JSON.stringify(selected)}`,
    );
    await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('.county-selection-context-row button')]
        .find((candidate) => candidate.innerText.trim() === 'All states');
      button?.click();
      return Boolean(button);
    })()`);
    await waitFor(
      cdp,
      `document.querySelectorAll('.territory-explorer-screen .us-state-path').length === 51`,
      `${stateName} return to national state map`,
    );
  }
  console.log(`PASS ${viewport.width}×${viewport.height}: selected and returned from all 51 state/DC county views`);
}

async function checkHomeMapAtViewport(cdp, viewport) {
  console.log(`Checking Home map at ${viewport.width}px viewport...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.home-map-viewport') &&
      document.querySelector('.home-map-state-path'))`,
    `the Home map at ${viewport.width}px`,
    60_000,
  );

  const dimensions = await evaluate(cdp, `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        minWidth: style.minWidth,
        cssWidth: style.width,
        flex: style.flex,
      };
    };
    return {
      document: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      stage: rect('.home-map-stage-v2'),
      commandHeader: rect('.pi-command-header'),
      mobileLogo: rect('.pi-mobile-logo'),
      content: rect('.home-map-content-v2'),
      visual: rect('.home-map-visual-v2'),
      map: rect('.home-map-viewport'),
      mapArtwork: rect('.home-map-viewport svg'),
      regionFilter: rect('.home-map-region-filter'),
      layerSelect: rect('.home-map-layer-select'),
      toolsSummary: rect('.home-map-mobile-tools > summary'),
      desktopZoom: rect('.home-map-toolbar-v2 > .home-map-zoom-control'),
      shortcuts: rect('.home-map-shortcuts'),
      shortcutRow: rect('.home-map-shortcut-row'),
      bottomNav: rect('.pi-mobile-nav'),
      shortcutBehavior: (() => {
        const row = document.querySelector('.home-map-shortcut-row');
        if (!row) return null;
        const bounds = row.getBoundingClientRect();
        const buttons = [...row.querySelectorAll('button')];
        return {
          count: buttons.length,
          scrollable: row.scrollWidth > row.clientWidth,
          fullyReflowed: buttons.length > 0 && buttons.every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
          }),
        };
      })(),
    };
  })()`);

  assert(
    dimensions.document <= viewport.width + 1,
    `Home map causes horizontal page overflow at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
  );
  assert(
    dimensions.map && dimensions.stage &&
      dimensions.map.width > 0 &&
      dimensions.map.right <= dimensions.stage.right + 1,
    `Map viewport escapes its panel at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
  );
  if (viewport.mobile && viewport.width < 768) {
    assert(
      dimensions.commandHeader &&
        dimensions.mobileLogo &&
        dimensions.mobileLogo.left >= dimensions.commandHeader.left + 1 &&
        dimensions.mobileLogo.right <= dimensions.commandHeader.right - 1 &&
        dimensions.mobileLogo.top >= dimensions.commandHeader.top + 1 &&
        dimensions.mobileLogo.bottom <= dimensions.commandHeader.bottom - 1,
      `Mobile logo frame is clipped by the command header at ${viewport.width}×${viewport.height}px: ${JSON.stringify(dimensions)}`,
    );
    const minimumMapHeight = viewport.height <= 500 ? 130 : 210;
    assert(
      dimensions.map.height >= minimumMapHeight,
      `Phone map canvas is too short at ${viewport.width}×${viewport.height}px: ${JSON.stringify(dimensions)}`,
    );
    assert(
      dimensions.shortcutBehavior &&
        dimensions.shortcutBehavior.count > 0 &&
        (dimensions.shortcutBehavior.scrollable || dimensions.shortcutBehavior.fullyReflowed),
      `Small-state shortcuts are clipped at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
    );
    const toolsWork = await evaluate(cdp, `(() => {
      const details = document.querySelector('.home-map-mobile-tools');
      if (!details) return false;
      details.open = true;
      const zoomIn = details.querySelector('[data-testid="mobile-button-map-zoom-in"]');
      const reset = details.querySelector('[data-testid="mobile-button-map-zoom-reset"]');
      if (!zoomIn || !reset || !zoomIn.getBoundingClientRect().width) return false;
      zoomIn.click();
      return true;
    })()`);
    assert(toolsWork, `The mobile map tools did not open at ${viewport.width}px`);
    await waitFor(
      cdp,
      `document.querySelector('.home-map-viewport')?.dataset.mapZoom === '1.2'`,
      `mobile zoom-in at ${viewport.width}px`,
    );
    await evaluate(cdp, `document.querySelector('[data-testid="mobile-button-map-zoom-reset"]')?.click()`);
    await waitFor(
      cdp,
      `document.querySelector('.home-map-viewport')?.dataset.mapZoom === '1'`,
      `mobile zoom reset at ${viewport.width}px`,
    );
    await evaluate(cdp, `document.querySelector('.home-map-mobile-tools').open = false`);
  }
  if (viewport.mobile) {
    const regionControlsReachable = await evaluate(cdp, `(() => {
      const container = document.querySelector('.home-map-region-filter');
      if (!container) return false;
      const buttons = [...container.querySelectorAll('button')];
      const labels = buttons.map((button) => button.innerText.trim());
      const expected = ['All', 'Northeast', 'Midwest', 'South', 'West'];
      container.scrollLeft = container.scrollWidth;
      const containerBounds = container.getBoundingClientRect();
      const lastBounds = buttons.at(-1)?.getBoundingClientRect();
      const reachable = expected.every((label) => labels.includes(label)) &&
        Boolean(lastBounds && lastBounds.left >= containerBounds.left - 1 &&
          lastBounds.right <= containerBounds.right + 1);
      container.scrollLeft = 0;
      return reachable;
    })()`);
    assert(
      regionControlsReachable,
      `Map region filters cannot all be reached at ${viewport.width}×${viewport.height}px`,
    );
  }
  if (viewport.mobile && viewport.height <= 500) {
    assert(
      dimensions.map.height >= 130,
      `Landscape phone map canvas is too short at ${viewport.width}×${viewport.height}px: ${JSON.stringify(dimensions)}`,
    );
    assert(
      dimensions.mapArtwork &&
        dimensions.mapArtwork.width <= dimensions.map.clientWidth + 1 &&
        dimensions.mapArtwork.height <= dimensions.map.clientWidth * (500 / 920) + 1,
      `Landscape map artwork does not fit its canvas at ${viewport.width}×${viewport.height}px: ${JSON.stringify(dimensions)}`,
    );
    const hasBottomNav = dimensions.bottomNav?.width > 0;
    if (hasBottomNav) {
      assert(
        dimensions.bottomNav.top >= 0 &&
          dimensions.bottomNav.bottom <= viewport.height + 1,
        `Bottom navigation is clipped at ${viewport.width}×${viewport.height}px: ${JSON.stringify(dimensions.bottomNav)}`,
      );
    }
    const mapReachable = await evaluate(cdp, `(() => {
      const map = document.querySelector('.home-map-viewport');
      const nav = document.querySelector('.pi-mobile-nav');
      if (!map) return false;
      map.scrollIntoView({ block: 'center' });
      const bounds = map.getBoundingClientRect();
      const navBounds = nav?.getBoundingClientRect();
      const lowerEdge = navBounds?.width ? navBounds.top : innerHeight;
      return bounds.top >= -1 && bounds.bottom <= lowerEdge + 1;
    })()`);
    assert(
      mapReachable,
      `Map cannot be scrolled above bottom navigation at ${viewport.width}×${viewport.height}px`,
    );
    if (dimensions.toolsSummary?.width > 0) {
      const toolsPanelReachable = await evaluate(cdp, `(() => {
        const details = document.querySelector('.home-map-mobile-tools');
        const panel = details?.querySelector('.home-map-mobile-tools-panel');
        const nav = document.querySelector('.pi-mobile-nav');
        if (!details || !panel || !nav) return false;
        details.querySelector('summary')?.scrollIntoView({ block: 'center' });
        details.open = true;
        const panelBounds = panel.getBoundingClientRect();
        const navBounds = nav.getBoundingClientRect();
        const reachable = panelBounds.width > 0 &&
          panelBounds.top >= 0 &&
          panelBounds.bottom <= navBounds.top + 1;
        details.open = false;
        return reachable;
      })()`);
      assert(
        toolsPanelReachable,
        `Map tools are clipped or covered by bottom navigation at ${viewport.width}×${viewport.height}px`,
      );
    } else {
      const desktopToolsWork = await evaluate(cdp, `(() => {
        const controls = document.querySelector('.home-map-toolbar-v2 > .home-map-zoom-control');
        const zoomIn = controls?.querySelector('[data-testid="button-map-zoom-in"]');
        const reset = controls?.querySelector('[data-testid="button-map-zoom-reset"]');
        if (!controls || !zoomIn || !reset) return false;
        controls.scrollIntoView({ block: 'center' });
        const bounds = controls.getBoundingClientRect();
        if (!bounds.width || bounds.top < 0 || bounds.bottom > innerHeight) return false;
        zoomIn.click();
        return true;
      })()`);
      assert(
        desktopToolsWork,
        `Map zoom controls are not reachable at ${viewport.width}×${viewport.height}px`,
      );
      await waitFor(
        cdp,
        `document.querySelector('.home-map-viewport')?.dataset.mapZoom === '1.2'`,
        `desktop zoom-in at ${viewport.width}px`,
      );
      await evaluate(cdp, `document.querySelector('[data-testid="button-map-zoom-reset"]')?.click()`);
      await waitFor(
        cdp,
        `document.querySelector('.home-map-viewport')?.dataset.mapZoom === '1'`,
        `desktop zoom reset at ${viewport.width}px`,
      );
    }
    const shortcutsReachable = await evaluate(cdp, `(() => {
      const shortcuts = document.querySelector('.home-map-shortcuts');
      const nav = document.querySelector('.pi-mobile-nav');
      if (!shortcuts) return false;
      shortcuts.scrollIntoView({ block: 'end' });
      const scrollContainer = (() => {
        for (let element = shortcuts.parentElement; element; element = element.parentElement) {
          if (element.scrollHeight > element.clientHeight + 1) return element;
        }
        return document.scrollingElement;
      })();
      if (nav?.getBoundingClientRect().width) {
        scrollContainer.scrollTop += nav.getBoundingClientRect().height + 8;
      }
      const bounds = shortcuts.getBoundingClientRect();
      const navBounds = nav?.getBoundingClientRect();
      const lowerEdge = navBounds?.width ? navBounds.top : innerHeight;
      return {
        reachable: bounds.top >= -1 && bounds.bottom <= lowerEdge + 1,
        shortcuts: { top: bounds.top, bottom: bounds.bottom },
        navTop: navBounds.top,
        pageScrollY: window.scrollY,
        scrollContainers: (() => {
          const containers = [];
          for (let element = shortcuts.parentElement; element; element = element.parentElement) {
            if (element.scrollHeight > element.clientHeight + 1) {
              containers.push({
                className: typeof element.className === 'string' ? element.className : element.tagName,
                top: element.scrollTop,
                height: element.clientHeight,
                scrollHeight: element.scrollHeight,
              });
            }
          }
          return containers;
        })(),
      };
    })()`);
    assert(
      shortcutsReachable?.reachable,
      `Map shortcuts cannot be scrolled above bottom navigation at ${viewport.width}×${viewport.height}px: ${JSON.stringify(shortcutsReachable)}`,
    );
  }

  const texasFill = await evaluate(cdp, `(() => {
    const texas = [...document.querySelectorAll('.home-map-state-path')]
      .find((path) => path.getAttribute('aria-label')?.startsWith('Texas.'));
    return texas?.getAttribute('fill') ?? null;
  })()`);
  assert(
    texasFill && /^#[0-9a-f]{6}$/i.test(texasFill),
    `Texas count shading is not a solid fill: ${texasFill}`,
  );
  const [, red, , blue] = texasFill.match(/^#(..)(..)(..)$/).map((channel) => parseInt(channel, 16));
  assert(blue > red, `Agency-count shading should use the blue sequential palette, received ${texasFill}`);

  await selectHomeMapStateAndReturn(cdp, viewport, 'Florida');
  await checkMapPaletteAtViewport(cdp, viewport);

  console.log(
    `✓ ${viewport.width}px: map fits, quality palettes switch, and missing/selected states remain distinct`,
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
    actionArea?.querySelector('.profile-more-actions')?.setAttribute('open', '');
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
        document.body.innerText.includes('Source Evidence & Data Mapping')`,
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
  if (viewport.mobile && viewport.width < 640) {
    const dockState = await evaluate(cdp, `(() => {
      const profile = document.querySelector('.provider-profile-overlay');
      const dock = profile?.querySelector('[data-testid="profile-action-dock"]');
      const quickActions = dock?.querySelector('.profile-phone-action-row');
      const nav = document.querySelector('.pi-mobile-nav');
      const rect = dock?.getBoundingClientRect();
      const buttons = [...(quickActions?.querySelectorAll('button') ?? [])].map(button => {
        const bounds = button.getBoundingClientRect();
        return { name: button.getAttribute('aria-label'), width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right };
      });
      return {
        count: buttons.length, buttons,
        bottomDockVisible: Boolean(rect && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight + 1),
        globalNavigationHidden: !nav || getComputedStyle(nav).display === 'none' || nav.getBoundingClientRect().height === 0,
      };
    })()`);
    assert(
      dockState?.bottomDockVisible && dockState.globalNavigationHidden &&
      dockState.count === 4 && dockState.buttons.every(button =>
        button.name && button.height >= 44 && button.width >= 44 && button.left >= -1 && button.right <= viewport.width + 1),
      `Phone profile must have one usable four-action dock without stacked app navigation at ${viewport.width}px: ${JSON.stringify(dockState)}`,
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

async function checkFireProfileAtViewport(cdp, viewport, agencyName = null) {
  const agencyDescription = agencyName ?? 'the first Fire agency';
  console.log(`Checking ${agencyDescription} at ${viewport.width}px viewport...`);
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
  await openAgencyProfile(cdp, 'fire', agencyName);
  if (agencyName) {
    const expectedProfileName = await evaluate(cdp, `(() => {
      const workspace = document.querySelector('main.profile-workspace');
      return workspace?.getAttribute('aria-label') === ${JSON.stringify(`${agencyName} Account 360 Workspace`)};
    })()`);
    assert(expectedProfileName, `Opened the wrong Fire profile instead of ${agencyName}`);
  }
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  const operationsSummary = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const baseline = profile?.querySelector('[data-testid="agency-operational-baseline"]');
    const summary = baseline?.querySelector('[data-testid="baseline-operational-metrics"]');
    if (!baseline || !summary) return null;
    baseline.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = baseline.getBoundingClientRect();
    const lead = summary.innerText.trim();
    return {
      visible: bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.bottom > 0 && bounds.top < innerHeight,
      fits: baseline.scrollWidth <= baseline.clientWidth + 1,
      fireMetrics: /\\bstations\\b/i.test(lead) &&
        /fire suppression engines/i.test(baseline.innerText),
      lead,
    };
  })()`);
  assert(
    operationsSummary?.visible && operationsSummary.fits && operationsSummary.fireMetrics,
    `Fire operational baseline is not usable at ${viewport.width}px: ${JSON.stringify(operationsSummary)}`,
  );
  if (agencyName && (viewport.width === 320 || viewport.width === 360)) {
    const observations = fireProfileOperationsByViewport.get(viewport.width) ?? new Map();
    observations.set(agencyName, operationsSummary.lead);
    fireProfileOperationsByViewport.set(viewport.width, observations);
  }
  const fireActions = await evaluate(cdp, `(() => {
    const area = document.querySelector('[data-testid="profile-primary-actions"]');
    if (!area) return null;
    const moreActions = area.querySelector('.profile-more-actions');
    if (!moreActions) return null;
    moreActions.open = true;
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
    const area = document.querySelector('[data-testid="profile-primary-actions"]');
    const moreActions = area?.querySelector('.profile-more-actions');
    if (moreActions) moreActions.open = true;
    const button = area?.querySelector('[aria-label="Inspect agency sources"]');
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
    const close = [...drawer.querySelectorAll('button')]
      .find((button) => button.innerText.trim() === 'Close');
    close?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = drawer.getBoundingClientRect();
    const closeBounds = close?.getBoundingClientRect();
    const closeStyle = close && getComputedStyle(close);
    return {
      withinViewport: bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
      fits: drawer.scrollWidth <= drawer.clientWidth + 1,
      hasUsableClose: Boolean(close && !close.disabled && closeBounds &&
        closeBounds.width > 0 && closeBounds.height > 0 &&
        closeBounds.left >= -1 && closeBounds.right <= innerWidth + 1 &&
        closeBounds.top >= -1 && closeBounds.bottom <= innerHeight + 1 &&
        closeStyle.visibility !== 'hidden' && closeStyle.display !== 'none'),
    };
  })()`);
  assert(
    fireSourceDrawer?.withinViewport && fireSourceDrawer.fits && fireSourceDrawer.hasUsableClose,
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
  if (viewport.width === 320 || viewport.width === 360) {
    await checkFireProfileDetailsAtViewport(cdp, viewport, agencyName);
  }
  console.log(
    `✓ ${viewport.width}px: ${agencyDescription}; baseline operations="${operationsSummary.lead}", ${fireSourceLinks} source links, actions, drawer, and overflow`,
  );
}

async function checkFireProfileDetailsAtViewport(cdp, viewport, agencyName) {
  const sections = [
    {
      value: 'operations',
      description: 'operations',
      expectedText: [
        'Clinical Emergency Performance & Patient Outcomes',
        'Clinical charts are not available in this account record',
        'Apparatus & Emergency Vehicle Fleet Breakdown',
        'Detailed fleet and receiving-hospital values are not listed in this account record',
      ],
    },
    {
      value: 'equipment',
      description: 'apparatus',
      expectedText: [
        'Apparatus & Emergency Vehicle Fleet Breakdown',
        'Detailed fleet and receiving-hospital values are not listed in this account record',
        'Frontline Apparatus & Maintenance Contracts',
      ],
    },
    {
      value: 'evidence',
      description: 'source evidence',
      expectedText: ['Source Evidence & Data Mapping'],
    },
  ];

  for (const section of sections) {
    const selected = await evaluate(cdp, `(() => {
      const picker = document.querySelector('[data-testid="select-profile-section-mobile"]');
      if (!picker || ![...picker.options].some((option) => option.value === ${JSON.stringify(section.value)})) {
        return false;
      }
      picker.value = ${JSON.stringify(section.value)};
      picker.dispatchEvent(new Event('change', { bubbles: true }));
      picker.scrollIntoView({ block: 'center', inline: 'nearest' });
      const bounds = picker.getBoundingClientRect();
      const style = getComputedStyle(picker);
      return bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1 &&
        style.visibility !== 'hidden' && style.display !== 'none';
    })()`);
    assert(
      selected,
      `Fire ${section.description} section picker is not reachable at ${viewport.width}px for ${agencyName}`,
    );
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="select-profile-section-mobile"]')?.value === ${JSON.stringify(section.value)}`,
      `the Fire ${section.description} section at ${viewport.width}px`,
    );

    const sectionState = await evaluate(cdp, `(() => {
      const profile = document.querySelector('main.profile-workspace');
      const expected = ${JSON.stringify(section.expectedText)};
      if (!profile) return null;
      const candidates = [...profile.querySelectorAll('h1, h2, h3, p, [role="status"]')];
      const target = candidates.find((element) =>
        expected.some((text) => element.innerText.includes(text)),
      );
      if (!target) {
        return {
          activeSection: document.querySelector('[data-testid="select-profile-section-mobile"]')?.value,
          expectedTextFound: false,
          profileText: profile.innerText.slice(-1800),
        };
      }
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      const bounds = target.getBoundingClientRect();
      const targetStyle = getComputedStyle(target);
      return {
        activeSection: document.querySelector('[data-testid="select-profile-section-mobile"]')?.value,
        expectedTextFound: true,
        targetVisible: bounds.width > 0 && bounds.height > 0 &&
          bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
          bounds.bottom > 0 && bounds.top < innerHeight &&
          targetStyle.visibility !== 'hidden' && targetStyle.display !== 'none',
        targetFits: target.scrollWidth <= target.clientWidth + 1,
        targetText: target.innerText.trim().slice(0, 220),
      };
    })()`);
    assert(
      sectionState?.activeSection === section.value &&
        sectionState.expectedTextFound &&
        sectionState.targetVisible &&
        sectionState.targetFits,
      `Fire ${section.description} details are not readable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(sectionState)}`,
    );
    await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

    if (section.value === 'evidence') {
      const evidenceControls = await evaluate(cdp, `(() => {
        const evidence = document.querySelector('#profile-source-evidence');
        const tableWrap = evidence?.querySelector('.scannable-table-wrap');
        const verify = [...(evidence?.querySelectorAll('button') ?? [])]
          .find((button) => button.innerText.trim() === 'Search CMS NPPES');
        const sourceLinks = [...(tableWrap?.querySelectorAll('a[href]') ?? [])];
        if (!evidence || !tableWrap || !verify || sourceLinks.length === 0) return null;

        verify.scrollIntoView({ block: 'center', inline: 'nearest' });
        const verifyBounds = verify.getBoundingClientRect();
        const verifyStyle = getComputedStyle(verify);
        const verifyReachable = !verify.disabled &&
          verifyBounds.width > 0 && verifyBounds.height > 0 &&
          verifyBounds.left >= -1 && verifyBounds.right <= innerWidth + 1 &&
          verifyBounds.top >= -1 && verifyBounds.bottom <= innerHeight + 1 &&
          verifyStyle.visibility !== 'hidden' && verifyStyle.display !== 'none';

        const finalSourceLink = sourceLinks[sourceLinks.length - 1];
        finalSourceLink.scrollIntoView({ block: 'center', inline: 'center' });
        const linkBounds = finalSourceLink.getBoundingClientRect();
        const tableBounds = tableWrap.getBoundingClientRect();
        return {
          verifyReachable,
          sourceRowCount: tableWrap.querySelectorAll('tbody tr').length,
          sourceLinkCount: sourceLinks.length,
          finalSourceLinkReachable: linkBounds.width > 0 && linkBounds.height > 0 &&
            linkBounds.left >= Math.max(-1, tableBounds.left - 1) &&
            linkBounds.right <= Math.min(innerWidth + 1, tableBounds.right + 1) &&
            linkBounds.top >= -1 && linkBounds.bottom <= innerHeight + 1,
        };
      })()`);
      assert(
        evidenceControls?.verifyReachable &&
          evidenceControls.sourceRowCount > 0 &&
          evidenceControls.sourceLinkCount > 0 &&
          evidenceControls.finalSourceLinkReachable,
        `Fire source evidence controls are not reachable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(evidenceControls)}`,
      );
      await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
    }
    console.log(`  ✓ ${viewport.width}px: ${agencyName} ${section.description} details and controls`);
  }
}

async function checkEmsProfileAtViewport(cdp, viewport, agencyName) {
  console.log(`Checking ${agencyName} at ${viewport.width}px viewport...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile ?? viewport.width < 768,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      document.body.innerText.includes('Interactive U.S. Territory Map')`,
    `the app at ${viewport.width}px`,
    60_000,
  );
  await openAgencyProfile(cdp, 'ems', agencyName);
  const openedProfileLabel = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    return profile?.getAttribute('aria-label') ?? null;
  })()`);
  assert(
    openedProfileLabel === `${agencyName} Account 360 Workspace`,
    `Opened the wrong EMS profile instead of ${agencyName}: ${JSON.stringify(openedProfileLabel)}`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

  const operationsSummary = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const baseline = profile?.querySelector('[data-testid="agency-operational-baseline"]');
    const summary = baseline?.querySelector('[data-testid="baseline-operational-metrics"]');
    if (!baseline || !summary) return null;
    baseline.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = baseline.getBoundingClientRect();
    const lead = summary.innerText.trim();
    return {
      visible: bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.bottom > 0 && bounds.top < innerHeight,
      fits: baseline.scrollWidth <= baseline.clientWidth + 1,
      hasLead: Boolean(lead) &&
        /active ambulances/i.test(baseline.innerText) &&
        !/fire suppression engines/i.test(baseline.innerText),
      lead,
    };
  })()`);
  assert(
    operationsSummary?.visible && operationsSummary.fits && operationsSummary.hasLead,
    `EMS operational baseline is not usable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(operationsSummary)}`,
  );

  const operationsSectionUsable = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const overlay = document.querySelector('.provider-profile-overlay');
    const sectionPicker = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (!profile || !overlay || !sectionPicker) return null;

    sectionPicker.value = 'operations';
    sectionPicker.dispatchEvent(new Event('change', { bubbles: true }));
    const operationHeading = [...profile.querySelectorAll('h2')]
      .find((heading) => /clinical emergency performance|active defibrillator/i.test(heading.innerText));
    const unavailable = [...profile.querySelectorAll('[role="status"]')]
      .find((status) => /clinical charts are not available/i.test(status.innerText));
    const target = operationHeading?.closest('section') ?? unavailable;
    if (!target) {
      return {
        targetFound: false,
        selectedSection: sectionPicker.value,
        headings: [...profile.querySelectorAll('h2')].map((heading) => heading.innerText.trim()).slice(-8),
      };
    }

    target.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
    const targetRect = target.getBoundingClientRect();
    const headerRect = profile.querySelector('header')?.getBoundingClientRect();
    const dock = profile.querySelector('.profile-action-dock');
    const dockRect = dock?.getBoundingClientRect();
    const topicNav = profile.querySelector('[data-testid="profile-topic-navigation"]');
    const topicNavRect = topicNav?.getBoundingClientRect();
    const bottomNavRect = document.querySelector('.pi-mobile-nav')?.getBoundingClientRect();
    const stickyNavActive = topicNav && getComputedStyle(topicNav).position === 'sticky' &&
      topicNavRect?.top >= 0 && topicNavRect.top < innerHeight;
    const clearTop = Math.max(
      headerRect?.bottom ?? 0,
      dockRect?.bottom ?? 0,
      stickyNavActive ? topicNavRect.bottom : 0,
    );
    const clearBottom = bottomNavRect?.top ?? innerHeight;
    const text = target.innerText.trim();
    return {
      targetFound: Boolean(text),
      selectedSection: sectionPicker.value,
      targetTextLength: text.length,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      clearTop,
      clearBottom,
      dockBottom: dockRect?.bottom,
      topicNavTop: topicNavRect?.top,
      topicNavBottom: topicNavRect?.bottom,
      overlayScrollTop: overlay.scrollTop,
      readable: targetRect.height > 0 && targetRect.top >= clearTop - 1 &&
        targetRect.top < clearBottom && targetRect.bottom > clearTop &&
        targetRect.left >= -1 && targetRect.right <= innerWidth + 1 &&
        text.length > 0,
    };
  })()`);
  assert(
    operationsSectionUsable?.targetFound &&
      operationsSectionUsable.selectedSection === 'operations' &&
      operationsSectionUsable.readable,
    `EMS operations content is obscured by profile controls at ${viewport.width}px for ${agencyName}: ${JSON.stringify(operationsSectionUsable)}`,
  );

  const emsActions = await evaluate(cdp, `(() => {
    const area = document.querySelector('[data-testid="profile-primary-actions"]');
    if (!area) return null;
    const moreActions = area.querySelector('.profile-more-actions');
    if (!moreActions) return null;
    moreActions.open = true;
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
  for (const [action, usable] of Object.entries(emsActions ?? {})) {
    assert(usable, `EMS ${action} profile action is not reachable at ${viewport.width}px for ${agencyName}`);
  }
  assert(
    emsActions && Object.keys(emsActions).length === 4,
    `EMS profile actions are incomplete at ${viewport.width}px for ${agencyName}: ${JSON.stringify(emsActions)}`,
  );

  const openedSourceDrawer = await evaluate(cdp, `(() => {
    const area = document.querySelector('[data-testid="profile-primary-actions"]');
    const moreActions = area?.querySelector('.profile-more-actions');
    if (moreActions) moreActions.open = true;
    const button = area?.querySelector('[aria-label="Inspect agency sources"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = button.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0 || bounds.right <= 0 || bounds.left >= innerWidth) return false;
    button.click();
    return true;
  })()`);
  assert(openedSourceDrawer, `EMS source inspection was not reachable at ${viewport.width}px for ${agencyName}`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]'))`,
    `the EMS source inspection drawer at ${viewport.width}px`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'drawer');
  const drawerUsability = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    if (!drawer) return null;
    const close = [...drawer.querySelectorAll('button')]
      .find((button) => button.innerText.trim() === 'Close');
    close?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = drawer.getBoundingClientRect();
    const closeBounds = close?.getBoundingClientRect();
    const closeStyle = close && getComputedStyle(close);
    return {
      withinViewport: bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
      fits: drawer.scrollWidth <= drawer.clientWidth + 1,
      hasSourceContent: drawer.innerText.trim().length > 0,
      hasUsableClose: Boolean(close && !close.disabled && closeBounds &&
        closeBounds.width > 0 && closeBounds.height > 0 &&
        closeBounds.left >= -1 && closeBounds.right <= innerWidth + 1 &&
        closeBounds.top >= -1 && closeBounds.bottom <= innerHeight + 1 &&
        closeStyle.visibility !== 'hidden' && closeStyle.display !== 'none'),
    };
  })()`);
  assert(
    drawerUsability?.withinViewport && drawerUsability.fits &&
      drawerUsability.hasSourceContent && drawerUsability.hasUsableClose,
    `EMS source drawer is not usable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(drawerUsability)}`,
  );
  const closedSourceDrawer = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const close = [...(drawer?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.trim() === 'Close');
    if (!close) return false;
    close.click();
    return true;
  })()`);
  assert(closedSourceDrawer, `The EMS source drawer could not be closed at ${viewport.width}px for ${agencyName}`);
  await waitFor(
    cdp,
    `!document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]')`,
    `the EMS source inspection drawer to close at ${viewport.width}px`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

  const evidenceSectionSelected = await evaluate(cdp, `(() => {
    const picker = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (!picker || ![...picker.options].some((option) => option.value === 'evidence')) {
      return false;
    }
    picker.value = 'evidence';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(
    evidenceSectionSelected,
    `EMS source workspace section was unavailable at ${viewport.width}px for ${agencyName}`,
  );
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="select-profile-section-mobile"]')?.value === 'evidence' &&
      Boolean(document.querySelector('[data-testid="panel-agency-source-workspace"]'))`,
    `the full EMS source workspace at ${viewport.width}px for ${agencyName}`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'workspace');

  const correctionActionOpened = await evaluate(cdp, `(() => {
    const workspace = document.querySelector('[data-testid="panel-agency-source-workspace"]');
    const button = workspace?.querySelector('[data-testid="button-add-agency-source-correction"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    const bounds = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    if (bounds.width <= 0 || bounds.height <= 0 ||
        bounds.left < -1 || bounds.right > innerWidth + 1 ||
        bounds.top < -1 || bounds.bottom > innerHeight + 1 ||
        style.visibility === 'hidden' || style.display === 'none') {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(
    correctionActionOpened,
    `EMS correction action was not reachable at ${viewport.width}px for ${agencyName}`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-correction"]'))`,
    `the EMS correction form at ${viewport.width}px for ${agencyName}`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'workspace');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'correction form');

  const correctionControls = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    if (!form) return null;
    const priorDetails = form.querySelector('details');
    if (priorDetails) priorDetails.open = true;
    const controls = [...form.querySelectorAll('input, select, textarea')];
    const results = controls.map((control) => {
      control.scrollIntoView({ block: 'center', inline: 'nearest' });
      const bounds = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const label = control.closest('label')?.innerText.trim() ||
        control.getAttribute('aria-label') ||
        control.getAttribute('placeholder') ||
        control.tagName.toLowerCase();
      return {
        label,
        reachable: bounds.width > 0 && bounds.height > 0 &&
          bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
          bounds.top >= -1 && bounds.bottom <= innerHeight + 1 &&
          style.visibility !== 'hidden' && style.display !== 'none',
      };
    });
    const save = form.querySelector('[data-testid="button-save-agency-source-fact"]');
    save?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const saveBounds = save?.getBoundingClientRect();
    const saveStyle = save && getComputedStyle(save);
    return {
      controls: results,
      saveReachable: Boolean(save && !save.disabled && saveBounds &&
        saveBounds.width > 0 && saveBounds.height > 0 &&
        saveBounds.left >= -1 && saveBounds.right <= innerWidth + 1 &&
        saveBounds.top >= -1 && saveBounds.bottom <= innerHeight + 1 &&
        saveStyle.visibility !== 'hidden' && saveStyle.display !== 'none'),
      saveLabel: save?.innerText.trim() ?? '',
    };
  })()`);
  assert(
    correctionControls?.controls.length >= 10,
    `EMS correction form fields are missing at ${viewport.width}px for ${agencyName}: ${JSON.stringify(correctionControls)}`,
  );
  const unreachableControls = correctionControls.controls
    .filter((control) => !control.reachable);
  assert(
    unreachableControls.length === 0,
    `EMS correction fields are not reachable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(unreachableControls)}`,
  );
  assert(
    correctionControls.saveReachable &&
      correctionControls.saveLabel.includes('Save correction'),
    `EMS correction save action is not reachable at ${viewport.width}px for ${agencyName}: ${JSON.stringify(correctionControls)}`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'workspace');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'correction form');

  const correctionFormClosed = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    const cancel = [...(form?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.trim() === 'Cancel');
    if (!cancel) return false;
    cancel.click();
    return true;
  })()`);
  assert(
    correctionFormClosed,
    `EMS correction form could not be closed at ${viewport.width}px for ${agencyName}`,
  );
  await waitFor(
    cdp,
    `!document.querySelector('[data-testid="form-add-agency-source-correction"]')`,
    `the EMS correction form to close at ${viewport.width}px for ${agencyName}`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  console.log(
    `✓ ${viewport.width}px: ${agencyName}; baseline operations="${operationsSummary.lead}", source drawer, correction fields/save action, and no horizontal overflow`,
  );
}

async function checkTerritoryAtViewport(cdp, viewport, { skipCountyRisk = false } = {}) {
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
      Boolean(document.querySelector('.county-signal-row'))`,
    `Florida county directory at ${viewport.width}px`,
  );
  const countySearchSet = await evaluate(cdp, `(() => {
    const input = document.querySelector('[data-testid="input-county-search"]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Miami-Dade County');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(countySearchSet, `County search was unavailable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `[...document.querySelectorAll('.county-signal-row h3')]
      .some((heading) => heading.innerText.trim() === 'Miami-Dade County')`,
    `the Miami-Dade County card at ${viewport.width}px`,
  );
  let riskMapReady = false;
  if (!skipCountyRisk) {
    await waitFor(
      cdp,
      `(() => {
        const details = [...document.querySelectorAll('.territory-explorer-screen details')]
          .find((candidate) =>
            candidate.querySelector('summary')?.innerText.includes('Boundary and source details'),
          );
        return Boolean(details &&
          (details.textContent.includes('county-equivalent source records') ||
           details.textContent.includes('County risk data could not be loaded.')));
      })()`,
      `the county risk source status at ${viewport.width}px`,
      60_000,
    );
    const riskSourceStatus = await evaluate(
      cdp,
      `[...document.querySelectorAll('.territory-explorer-screen details')]
        .find((candidate) =>
          candidate.querySelector('summary')?.innerText.includes('Boundary and source details'),
        )?.textContent ?? ''`,
    );
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
  } else {
    console.log(`ℹ ${viewport.width}px: skipping unrelated county risk-data check`);
  }
  await evaluate(cdp, `document.querySelector('.county-drilldown-shell')?.scrollIntoView({ block: 'start' })`);
  const countyLayout = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.county-drilldown-shell');
    const breadcrumb = document.querySelector('.geography-drilldown-breadcrumb');
    const sourceDetails = [...document.querySelectorAll('.territory-explorer-screen details')]
      .find((candidate) =>
        candidate.querySelector('summary')?.innerText.includes('Boundary and source details'),
      );
    const search = shell?.querySelector('input');
    const card = [...document.querySelectorAll('.county-signal-row')]
      .find((candidate) => candidate.querySelector('h3')?.innerText.trim() === 'Miami-Dade County');
    const title = card?.querySelector('h3');
    const inspect = card?.querySelector('[data-testid^="button-inspect-county-"]');
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
    if (!shell || !search || !card || !title || !inspect) return null;
    const shellRect = shell.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const cardStyle = getComputedStyle(card);
    return {
      documentWidth: root.scrollWidth,
      shellLeft: shellRect.left,
      shellRight: shellRect.right,
      searchLeft: searchRect.left,
      searchRight: searchRect.right,
      inspectLeft: inspect.getBoundingClientRect().left,
      inspectRight: inspect.getBoundingClientRect().right,
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
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
      countyLayout.inspectLeft >= -1 &&
      countyLayout.inspectRight <= viewport.width + 1 &&
      countyLayout.cardScrollWidth <= countyLayout.cardClientWidth + 1,
    `County search/Inspect county is clipped at ${viewport.width}px: ${JSON.stringify(countyLayout)}`,
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

  const countyDisclosure = await evaluate(cdp, `(() => {
    const card = [...document.querySelectorAll('.county-signal-row')]
      .find((candidate) => candidate.querySelector('h3')?.innerText.trim() === 'Miami-Dade County');
    const details = card?.querySelector('[data-testid^="details-county-context-"]');
    if (!card || !details || card.querySelector('details:not([open])')) return null;
    const places = [...card.querySelectorAll('.county-profile-city-list button')]
      .map((button) => button.innerText.trim());
    const context = [...card.querySelectorAll('.cv-source-figures > div')].map((item) => ({
      label: item.querySelector('dt')?.innerText.trim() ?? '',
      value: item.querySelector('dd')?.innerText.trim() ?? '',
    }));
    const sourceDetails = card.querySelector('.county-figure-source-details');
    return {
      places,
      context,
      sourcesVisible: Boolean(sourceDetails?.getBoundingClientRect().height),
      sourceCoverage: sourceDetails?.innerText ?? '',
      sourceCountyFips: sourceDetails?.innerText.includes('Display geography: county FIPS 12086') ?? false,
    };
  })()`);
  const expectedCountyPlaces = [
    'Miami', 'Hialeah', 'Miami Gardens', 'Miami Beach',
    'Homestead', 'North Miami', 'Doral', 'Coral Gables',
  ];
  const expectedContextFigures = [
    'Emergency transports per year',
    'Population age 65+',
    'Median household income',
    'Poverty rate',
    'Distance to primary cath lab',
  ];
  assert(
    countyDisclosure &&
      expectedCountyPlaces.every((place) => countyDisclosure.places.includes(place)) &&
      countyDisclosure.places.length === expectedCountyPlaces.length,
    `Mapped Miami-Dade places were missing from the disclosure at ${viewport.width}px: ${JSON.stringify(countyDisclosure?.places)}`,
  );
  assert(
    countyDisclosure?.context.length === expectedContextFigures.length &&
      expectedContextFigures.every((label) =>
        countyDisclosure.context.some((figure) => figure.label === label && figure.value && figure.value !== 'Not reported'),
      ),
    `Miami-Dade context figures were missing or empty at ${viewport.width}px: ${JSON.stringify(countyDisclosure?.context)}`,
  );
  assert(
    countyDisclosure?.sourcesVisible &&
      countyDisclosure.sourceCoverage.includes('Sources & coverage') &&
      countyDisclosure.sourceCoverage.includes('Source details are not attached') &&
      countyDisclosure.sourceCountyFips,
    `County source coverage is not visible inline at ${viewport.width}px: ${JSON.stringify(countyDisclosure)}`,
  );
  const disclosureLayout = await evaluate(cdp, `(() => {
    const card = [...document.querySelectorAll('.county-signal-row')]
      .find((candidate) => candidate.querySelector('h3')?.innerText.trim() === 'Miami-Dade County');
    const shell = document.querySelector('.county-drilldown-shell');
    if (!card || !shell) return null;
    const cardBounds = card.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      shellWidth: shell.getBoundingClientRect().width,
      cardLeft: cardBounds.left,
      cardRight: cardBounds.right,
      cardWidth: card.clientWidth,
      cardScrollWidth: card.scrollWidth,
    };
  })()`);
  assert(
    disclosureLayout &&
      disclosureLayout.documentWidth <= viewport.width + 1 &&
      disclosureLayout.cardLeft >= -1 &&
      disclosureLayout.cardRight <= viewport.width + 1 &&
      disclosureLayout.cardScrollWidth <= disclosureLayout.cardWidth + 1,
    `County disclosure overflows horizontally at ${viewport.width}px: ${JSON.stringify(disclosureLayout)}`,
  );

  const inspectFocused = await evaluate(cdp, `(() => {
    const card = [...document.querySelectorAll('.county-signal-row')]
      .find((candidate) => candidate.querySelector('h3')?.innerText.trim() === 'Miami-Dade County');
    const button = card?.querySelector('[data-testid^="button-inspect-county-"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.focus();
    window.__countyButtonKeyboardEvents = [];
    button.addEventListener('keydown', (event) => {
      window.__countyButtonKeyboardEvents.push(\`keydown:\${event.key}\`);
    });
    button.addEventListener('click', () => {
      window.__countyButtonKeyboardEvents.push('click');
    });
    return document.activeElement === button;
  })()`);
  assert(inspectFocused, `Inspect county could not receive keyboard focus at ${viewport.width}px`);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'char',
    key: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const keyboardProviderView = await evaluate(cdp, `(() => {
    const text = document.body.innerText;
    return {
      hasProviderHeading: text.includes('EMS & Fire Providers ('),
      hasExpectedCounty: text.includes('Miami-Dade County, Florida'),
      countyPanelVisible: Boolean(document.querySelector('.county-city-directory-panel')),
      activeElementLabel: document.activeElement?.innerText?.trim() ?? '',
      keyboardEvents: window.__countyButtonKeyboardEvents ?? [],
      bodyTail: text.slice(-700),
    };
  })()`);
  assert(
    keyboardProviderView.hasProviderHeading &&
      keyboardProviderView.hasExpectedCounty &&
      keyboardProviderView.countyPanelVisible &&
      keyboardProviderView.keyboardEvents.includes('keydown:Enter') &&
      keyboardProviderView.keyboardEvents.includes('click'),
    `Inspect county did not open Miami-Dade providers by keyboard at ${viewport.width}px: ${JSON.stringify(keyboardProviderView)}`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.county-city-directory-panel'))`,
    `the selected county city directory at ${viewport.width}px`,
  );
  await evaluate(cdp, `document.querySelector('.county-single-map-panel')?.scrollIntoView({ block: 'start' })`);
  const cityPanel = await evaluate(cdp, `(() => {
    const panel = document.querySelector('.county-city-directory-panel');
    const heading = panel?.querySelector('h3,h4');
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
  console.log(`✓ ${viewport.width}px: county disclosure, 8 mapped places, 5 context figures, source coverage, keyboard Inspect county, no horizontal overflow`);
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

function assertFireOperationsDifferAtViewport(viewport) {
  const fireOperations = fireProfileOperationsByViewport.get(viewport.width);
  assert(
    fireOperations?.size >= 2 && new Set(fireOperations.values()).size >= 2,
    `Fire profiles do not cover distinct operations details at ${viewport.width}px: ${JSON.stringify(
      Object.fromEntries(fireOperations ?? []),
    )}`,
  );
}

async function checkMobileEquipmentBrief(cdp, viewport, category, agencyName) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean([...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Agencies'))`, 'agency navigation', 60_000);
  await openAgencyProfile(cdp, category, agencyName);
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="profile-equipment-summary"]'))`, 'equipment brief');
  await assertNoHorizontalOverflow(cdp, viewport.width, 'phone-first equipment brief');
  if (viewport.width < 768) {
    const opening=await evaluate(cdp, `(() => {
      document.querySelector('.provider-profile-overlay').scrollTop=0;
      const contact=document.querySelector('.profile-header-contact');
      const closedInitially=!contact.open;
      contact.querySelector('summary').click();
      const expanded=contact.open && contact.querySelector('.profile-contact-detail').getBoundingClientRect().height>0;
      contact.querySelector('summary').click();
      const header=document.querySelector('.profile-executive-header').getBoundingClientRect();
      const monitor=document.querySelector('[data-testid="equipment-line-monitor"]').getBoundingClientRect();
      const bottomNav=document.querySelector('[aria-label="Mobile navigation"]');
      return {closedInitially,expanded,headerHeight:header.height,monitorBottom:monitor.bottom};
    })()`);
    assert(opening.closedInitially && opening.expanded, 'mobile contact disclosure is not accessible');
    assert(opening.headerHeight < 350, `mobile identity block is still oversized: ${JSON.stringify(opening)}`);
    assert(opening.monitorBottom < viewport.height - 65, `primary equipment is below the opening screen: ${JSON.stringify(opening)}`);
    console.log(`Opening ${viewport.width}px: identity ${Math.round(opening.headerHeight)}px, first equipment ends at ${Math.round(opening.monitorBottom)}px`);
    const initialShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(`/tmp/profile-opening-${viewport.width}.png`,Buffer.from(initialShot.result.data,'base64'));
  }
  const result = await evaluate(cdp, `(() => {
    const tech=document.querySelector('[data-testid="profile-equipment-summary"]');
    const buyback=document.querySelector('[data-testid="profile-buyback-insights"]');
    const operations=document.querySelector('[data-testid="baseline-operational-metrics"]');
    const actions=[...document.querySelectorAll('.profile-contact-actions a')];
    const details=tech.querySelector('details');
    details.querySelector('summary').click();
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
    return {
      order:!!(tech.compareDocumentPosition(buyback)&Node.DOCUMENT_POSITION_FOLLOWING)&&
        !!(buyback.compareDocumentPosition(operations)&Node.DOCUMENT_POSITION_FOLLOWING),
      lines:tech.querySelectorAll('.aib-eq').length,
      icons:tech.querySelectorAll('.aib-eq > svg').length,
      sourceOpen:details.open, sourceVisible:visible(details.querySelector('li')),
      sourceText:details.innerText,
      noQuote:buyback.innerText.includes('No current quote recorded'),
      actions:actions.map(e=>({href:e.getAttribute('href'),height:e.getBoundingClientRect().height})),
      clipped:[...tech.querySelectorAll('p,dt,dd')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent),
    };
  })()`);
  assert(result.order && result.lines === 6 && result.icons === 6, `equipment structure: ${JSON.stringify(result)}`);
  assert(result.sourceOpen && result.sourceVisible && result.sourceText.includes('does not prove'), 'source basis is not touch-readable');
  assert(result.noQuote, 'a real agency was given an invented offer');
  assert(result.clipped.length === 0, `equipment facts clipped: ${JSON.stringify(result.clipped)}`);
  assert(result.actions.length > 0 && result.actions.every(a=>a.href && a.height >= 43), 'contact action is missing or too small');
  if (viewport.width === 390) {
    for (const theme of ['dark', 'miami-vice', 'daylight']) {
      await setPrintTheme(cdp, theme);
      await assertNoHorizontalOverflow(cdp, viewport.width, `${theme} equipment brief`);
    }
    await evaluate(cdp, `document.querySelector('[aria-label="Account 360 Executive Decision Header"]').scrollIntoView({block:'start'});`);
    const identityShot=await cdp.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
    await writeFile('/tmp/profile-mobile-identity.png', Buffer.from(identityShot.result.data,'base64'));
  }
  await evaluate(cdp, `document.querySelector('[data-testid="equipment-source-basis"]').open=false;
    document.querySelector('[data-testid="profile-equipment-summary"]').scrollIntoView({block:'start'});`);
  // The first row must remain below the actual sticky header/action geometry.
  const clearance=await evaluate(cdp, `(() => {
    const row=document.querySelector('[data-testid="equipment-line-monitor"]').getBoundingClientRect();
    const headers=[...document.querySelectorAll('main.profile-workspace > header,.profile-action-dock')]
      .filter(e=>['sticky','fixed'].includes(getComputedStyle(e).position)).map(e=>e.getBoundingClientRect().bottom);
    return {rowTop:row.top,bottom:Math.max(0,...headers)};
  })()`);
  assert(clearance.rowTop>=clearance.bottom-1, `equipment row hidden under actions: ${JSON.stringify(clearance)}`);
  const shot=await cdp.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  await writeFile(`/tmp/profile-equipment-${viewport.width}-${category}.png`, Buffer.from(shot.result.data,'base64'));
  // Enlarge just the new brief to exercise long values and natural reflow, not unrelated app chrome.
  await evaluate(cdp, `(() => {const e=document.querySelector('.aib');e.style.zoom='2';e.style.width='50%';})()`);
  const enlarged=await evaluate(cdp, `(() => {
    const host=document.querySelector('.aib');
    return [...host.querySelectorAll('p,dt,dd,summary')].filter(e=>{
      const banner=e.closest('.aib-top');
      if (banner && getComputedStyle(banner).clipPath === 'inset(50%)') return false;
      return e.getBoundingClientRect().height>0&&e.scrollWidth>e.clientWidth+2;
    }).map(e=>e.innerText);
  })()`);
  assert(enlarged.length === 0, `200% brief text clipped: ${JSON.stringify(enlarged)}`);
  await evaluate(cdp, `(() => {const e=document.querySelector('.aib');e.style.zoom='';e.style.width='';})()`);
  console.log(`PASS ${viewport.width}px ${category}: equipment first, buy-back, touch sources, contact targets, 200% reflow`);
}

async function checkCountyPolish(cdp, viewport) {
  const checkOverflow = async (area) => assert(await evaluate(cdp,
    `document.documentElement.scrollWidth <= innerWidth + 2 && document.body.scrollWidth <= innerWidth + 2`),
    `page overflow in ${area} at ${viewport.width}px`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean([...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Territory'))`, 'territory navigation', 60000);
  await evaluate(cdp, `(() => {const s=document.createElement('style');s.textContent='*{scroll-behavior:auto!important}';document.head.appendChild(s);})()`);
  await clickVisibleButton(cdp, 'Territory', 'Territory');
  await waitFor(cdp, `Boolean(document.querySelector('#home-state-picker'))`, 'state selector');
  await evaluate(cdp, `(() => {
    const e=document.querySelector('#home-state-picker');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'FL');
    e.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector('.county-brief')) && Boolean(document.querySelector('.county-inspector-panel'))`, 'county cards',60000);
  await waitFor(cdp, `Boolean(document.querySelector('.ci-name'))`, 'county preview data',60000);
  const state = await evaluate(cdp, `(() => {
    const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {width:b.width,height:b.height}};
    const preview=document.querySelector('.county-inspector-panel');
    const card=document.querySelector('.county-brief');
    return {preview:r(preview),card:r(card),parts:Object.fromEntries(
      ['cb-head','cb-group--snapshot','cb-group--context','cb-risk','cb-ref','cb-sources'].map(k=>[k,r(card.querySelector('.'+k))]))};
  })()`);
  await checkOverflow('county directory');
  await evaluate(cdp, `document.querySelector('.county-inspector-panel').scrollIntoView({block:'start'})`);
  let shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`/tmp/county-polish-${process.env.COUNTY_POLISH_TAG || 'after'}-${viewport.width}-preview.png`,Buffer.from(shot.result.data,'base64'));
  await evaluate(cdp, `document.querySelector('.county-brief').scrollIntoView({block:'start'})`);
  shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`/tmp/county-polish-${process.env.COUNTY_POLISH_TAG || 'after'}-${viewport.width}-cards.png`,Buffer.from(shot.result.data,'base64'));
  if(process.env.COUNTY_BRIEF_ONLY === '1') {
    const readability=await evaluate(cdp, `(() => {
      const card=document.querySelector('.county-brief');
      const expected={population:'184,943',averageTransportMinutes:'18.3',annualCardiacArrestIncidents:'318',
        annualEmergencyTransports:'15,165',seniorPopPct:'24.3%',medianIncome:'73,943',povertyRatePct:'18.3%',primaryCathLabDistanceMiles:'16.1'};
      const missing=Object.entries(expected).filter(([key,value])=>!card.querySelector('[data-figure-key="'+key+'"] dd')?.innerText.includes(value));
      const overlap=[...card.querySelectorAll('[data-figure-key]')].filter(e=>{
        const d=e.querySelector('dt')?.getBoundingClientRect(),v=e.querySelector('dd')?.getBoundingClientRect();
        return d&&v&&d.bottom>v.top+1&&v.bottom>d.top+1&&d.right>v.left+1&&v.right>d.left+1;
      }).map(e=>e.dataset.figureKey);
      const clipped=[...document.querySelectorAll('.county-brief dt,.county-brief dd,.ci dt,.ci dd')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.innerText);
      const bounds=card.getBoundingClientRect();
      const outside=[...card.querySelectorAll('.cb-body,.cb-body>*,[data-figure-key] dd')].filter(e=>{
        const r=e.getBoundingClientRect();
        return r.right>bounds.right+2||r.left<bounds.left-2;
      }).map(e=>e.className||e.tagName);
      return {missing,overlap,clipped,outside,
        contextGrid:getComputedStyle(card.querySelector('.cb-group--context .cb-figs')).gridTemplateColumns,
        containers:(()=>{const a=[];let e=card.querySelector('.cb-group--context .cb-figs');while(e){if(getComputedStyle(e).containerType!=='normal')a.push({class:e.className,width:e.clientWidth,type:getComputedStyle(e).containerType});e=e.parentElement;}return a})(),
        rowStyle:[...card.querySelectorAll('.cb-group--context .cb-fig,.cb-group--context dt,.cb-sources')].slice(0,3).map(e=>({class:e.className,font:getComputedStyle(e).fontSize,line:getComputedStyle(e).lineHeight,padding:getComputedStyle(e).padding,margin:getComputedStyle(e).margin})),
        places:card.querySelectorAll('.cb-place').length,
        primaryTouch:card.querySelector('.cb-inspect').getBoundingClientRect().height};
    })()`);
    assert(!readability.missing.length, 'county facts lost: '+JSON.stringify(readability.missing));
    assert(!readability.overlap.length, 'county labels overlap values: '+JSON.stringify(readability.overlap));
    assert(!readability.clipped.length, 'county text clipped: '+JSON.stringify(readability.clipped));
    assert(!readability.outside.length, 'county content outside card: '+JSON.stringify(readability.outside));
    assert(readability.places===7,'county places lost');
    if(viewport.mobile) assert(readability.primaryTouch>=44,'phone Inspect target below44px');
    await evaluate(cdp, `(() => {
      const p=[...document.querySelectorAll('path.cv-county-path')].find(p=>p.querySelector('title')?.textContent.startsWith('Madison County'));
      if(p)p.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    })()`);
    await waitFor(cdp, `document.querySelector('.ci-name')?.textContent.includes('Madison County')`, 'Madison county preview');
    await evaluate(cdp, `document.querySelector('.county-inspector-panel').scrollIntoView({block:'start'})`);
    shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile('/tmp/county-polish-'+viewport.width+'-madison.png',Buffer.from(shot.result.data,'base64'));
    console.log(JSON.stringify({viewport,state,readability,madisonPreview:true}));
    return;
  }
  await evaluate(cdp, `document.querySelector('.county-brief .cb-inspect').click()`);
  await waitFor(cdp, `Boolean(document.querySelector('.cv-map-stage--county'))`, 'selected county');
  const selected=await evaluate(cdp, `(() => {
    const r=e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height}};
    return {map:r(document.querySelector('.cv-map-stage--county').closest('.cv-map-panel')),
      places:r(document.querySelector('.county-city-directory-panel')),
      mapStage:r(document.querySelector('.cv-map-stage--county')),
      placesCount:document.querySelectorAll('.cv-place-row').length};
  })()`);
  await checkOverflow('selected county');
  await evaluate(cdp, `document.querySelector('.cv-map-stage--county').scrollIntoView({block:'center'})`);
  shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`/tmp/county-polish-${process.env.COUNTY_POLISH_TAG || 'after'}-${viewport.width}-selected.png`,Buffer.from(shot.result.data,'base64'));
  if(viewport.width >= 768) await clickVisibleButton(cdp, 'Table', 'provider table');
  const table=await evaluate(cdp, `(() => {
    const e=[...document.querySelectorAll('table')].find(t=>t.innerText.includes('Provider')||t.innerText.includes('PROVIDER'));
    if(!e)return null;
    return {headers:e.querySelector('thead')?.innerText,recovery:/claim.dollar recovery estimate/i.test(e.innerText),
      icons:e.querySelectorAll('svg').length,headerIcons:e.querySelectorAll('thead svg').length,rows:e.querySelectorAll('tbody tr').length};
  })()`);
  await evaluate(cdp, `(() => {
    const table=[...document.querySelectorAll('table')].find(t=>/provider/i.test(t.innerText));
    if(table?.getBoundingClientRect().height) table.scrollIntoView({block:'start'});
  })()`);
  shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`/tmp/county-polish-${process.env.COUNTY_POLISH_TAG || 'after'}-${viewport.width}-providers.png`,Buffer.from(shot.result.data,'base64'));
  console.log(JSON.stringify({viewport,state,selected,table}));
  if (process.env.COUNTY_POLISH_TAG !== 'before') {
    if(viewport.width >= 768) {
      assert(table && !table.recovery, 'unsupported claim recovery column remains');
      assert(table.headerIcons >= 4 && table.rows > 0, 'provider table lacks recognizable visual labels or records');
    }
    await evaluate(cdp, `document.querySelector('.cv-place-row').click()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="button-show-all-places"]'))`, 'selected place filter');
    await evaluate(cdp, `document.querySelector('[data-testid="button-show-all-places"]').click()`);
  }
}

async function main() {
  if (
    process.env.PROFILE_LAYOUT_ONLY !== '1' &&
    process.env.PROFILE_PRINT_ONLY !== '1' &&
    process.env.NAV_LAYOUT_ONLY !== '1' &&
    process.env.MOBILE_NAV_LABELS_ONLY !== '1' &&
    process.env.MOBILE_NAV_A11Y_ONLY !== '1'
  ) {
    await checkPublishedRoutes();
    if (process.env.ROUTES_ONLY === '1') return;
  }

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

    if (process.env.COUNTY_POLISH_ONLY === '1') {
      for(const viewport of [{width:1280,height:900,mobile:false},{width:390,height:844,mobile:true}]) {
        if(process.env.PROFILE_TEST_WIDTH && viewport.width !== Number(process.env.PROFILE_TEST_WIDTH))continue;
        await checkCountyPolish(cdp,viewport);
      }
      return;
    }
    if (process.env.MOBILE_NAV_A11Y_ONLY === '1') {
      await checkMobileNavigationAccessibility(cdp, { width: 360, height: 844 });
      return;
    }

    if (process.env.MOBILE_NAV_LABELS_ONLY === '1') {
      await checkMobileNavigationLabels(cdp);
      return;
    }

    if (process.env.PROFILE_OVERVIEW_PRINT_ONLY === '1') {
      for (const theme of ['daylight', 'dark', 'miami-vice'].filter((theme) =>
        !process.env.PROFILE_PRINT_THEME || theme === process.env.PROFILE_PRINT_THEME,
      )) {
        for (const testCase of profilePrintCases.filter((item) =>
          !process.env.PROFILE_PRINT_CATEGORY || item.category === process.env.PROFILE_PRINT_CATEGORY,
        )) {
          for (const paperSize of printPaperSizes.filter((paper) =>
            !process.env.PROFILE_PRINT_PAPER ||
            paper.name.toLowerCase() === process.env.PROFILE_PRINT_PAPER.toLowerCase(),
          )) {
            await checkProviderOverviewPrintCase(
              cdp,
              testCase,
              userDataDir,
              theme,
              paperSize,
            );
          }
        }
      }
      console.log('Provider Overview A4 and Letter print checks passed in Daylight, Dark, and Miami Vice.');
      return;
    }

    if (process.env.PROFILE_PRINT_ONLY === '1') {
      const emsSourceFixture = {
        'zoll-agency-oh-cleveland': {
          sourceRecordAssociations: [],
          sourceFacts: [{
            id: 'browser-print-regression-source',
            fieldKey: 'annualEmergencyVolume',
            value: '108,000',
            sourceName: 'Cleveland EMS Annual Report',
            sourceRecordId: 'annual-report-fy2025',
            sourceUrl: 'https://www.cleveland-oh.gov/ems/annual-report',
            reportingPeriod: 'FY2025',
            geographicLevel: 'agency',
            geographicId: 'zoll-agency-oh-cleveland',
            basis: 'source-reported',
            enteredAt: '2026-11-06T00:00:00.000Z',
          }],
        },
      };
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          if (location.origin === 'null') return;
          localStorage.setItem(
            'ems_territory_agency_source_records_v1',
            ${JSON.stringify(JSON.stringify(emsSourceFixture))}
          );
        })();`,
      });
      for (const theme of ['daylight', 'dark', 'miami-vice'].filter((theme) =>
        !process.env.PROFILE_PRINT_THEME || theme === process.env.PROFILE_PRINT_THEME,
      )) {
        for (const testCase of profilePrintCases.filter((item) =>
          !process.env.PROFILE_PRINT_CATEGORY || item.category === process.env.PROFILE_PRINT_CATEGORY,
        )) {
          for (const paperSize of printPaperSizes.filter((paper) =>
            !process.env.PROFILE_PRINT_PAPER ||
            paper.name.toLowerCase() === process.env.PROFILE_PRINT_PAPER.toLowerCase(),
          )) {
            await checkProfilePrintCase(
              cdp,
              testCase,
              userDataDir,
              downloadPath,
              theme,
              paperSize,
            );
          }
        }
      }
      const overviewThemes = ['daylight', 'dark', 'miami-vice'].filter((theme) =>
        !process.env.PROFILE_PRINT_THEME || theme === process.env.PROFILE_PRINT_THEME,
      );
      const overviewCases = profilePrintCases.filter((item) =>
        !process.env.PROFILE_PRINT_CATEGORY || item.category === process.env.PROFILE_PRINT_CATEGORY,
      );
      const overviewPaperSizes = printPaperSizes.filter((paper) =>
        !process.env.PROFILE_PRINT_PAPER ||
        paper.name.toLowerCase() === process.env.PROFILE_PRINT_PAPER.toLowerCase(),
      );
      for (const theme of overviewThemes) {
        for (const testCase of overviewCases) {
          for (const paperSize of overviewPaperSizes) {
            await checkProviderOverviewPrintCase(
              cdp,
              testCase,
              userDataDir,
              theme,
              paperSize,
            );
          }
        }
      }
      await checkFieldRoutePrint(cdp, userDataDir);
      console.log('Provider dossier and Overview, plus Field Work A4 and Letter print checks passed in Daylight, Dark, and Miami Vice.');
      return;
    }

    if (process.env.NAV_LAYOUT_ONLY === '1') {
      await checkSharedNavigation(cdp);
      return;
    }

    if (process.env.PROFILE_EQUIPMENT_ONLY === '1') {
      for (const [viewport, category, name] of [
        [{width:320,height:740,mobile:true}, 'ems', emsProfileCases[1]],
        [{width:390,height:844,mobile:true}, 'fire', fireProfileCases[1]],
        [{width:430,height:932,mobile:true}, 'ems', emsProfileCases[0]],
        [{width:844,height:390,mobile:true}, 'fire', fireProfileCases[0]],
        [{width:1280,height:900,mobile:false}, 'ems', emsProfileCases[0]],
      ]) {
        if (process.env.PROFILE_TEST_WIDTH && viewport.width !== Number(process.env.PROFILE_TEST_WIDTH)) continue;
        await checkMobileEquipmentBrief(cdp, viewport, category, name);
      }
      return;
    }

    if (process.env.PROFILE_LAYOUT_ONLY === '1') {
      const profileLayoutViewports = [
        { width: 390, height: 844, mobile: true },
        { width: 1024, height: 900, mobile: false },
        { width: 1280, height: 900, mobile: false },
      ];
      for (const viewport of profileLayoutViewports) {
        await checkCompactProfileLayoutAtViewport(
          cdp,
          viewport,
          'ems',
          emsProfileCases[0],
        );
        await checkCompactProfileLayoutAtViewport(
          cdp,
          viewport,
          'fire',
          fireProfileCases[0],
        );
      }
      console.log('Independent EMS and Fire compact profile layout checks passed.');
      return;
    }

    if (process.env.STATE_MAP_AUDIT_ONLY === '1') {
      const expectedAcs = buildExpectedAcsStateSummaries();
      await checkEveryStateMapAtViewport(
        cdp,
        { width: 1366, height: 768, mobile: false },
        expectedAcs,
        true,
      );
      await checkEveryStateMapAtViewport(
        cdp,
        { width: 390, height: 844, mobile: true },
        expectedAcs,
        true,
      );
      return;
    }

    if (process.env.HOME_MAP_ONLY === '1') {
      for (const viewport of [
        { width: 320, height: 740, mobile: true },
        { width: 402, height: 700, mobile: true },
        { width: 390, height: 844, mobile: true },
        ...homeMapLandscapeViewports,
        { width: 1280, height: 900, mobile: false },
      ]) {
        await checkHomeMapAtViewport(cdp, viewport);
      }
      return;
    }

    if (process.env.COUNTY_CARD_ONLY === '1') {
      for (const viewport of countyCardViewports) {
        await checkTerritoryAtViewport(cdp, viewport, { skipCountyRisk: true });
      }
      console.log('County card disclosure responsive checks passed.');
      return;
    }

    if (process.env.EMS_PROFILE_ONLY === '1') {
      for (const viewport of [
        { width: 320, height: 740, mobile: true },
        { width: 360, height: 844, mobile: true },
      ]) {
        for (const agencyName of emsProfileCases) {
          await checkEmsProfileAtViewport(cdp, viewport, agencyName);
        }
      }
      console.log('Representative EMS profile responsive checks passed.');
      return;
    }

    if (process.env.FIRE_PROFILE_ONLY === '1') {
      for (const viewport of [
        { width: 320, height: 740, mobile: true },
        { width: 360, height: 844, mobile: true },
      ]) {
        for (const agencyName of fireProfileCases) {
          await checkFireProfileAtViewport(cdp, viewport, agencyName);
        }
        assertFireOperationsDifferAtViewport(viewport);
      }
      console.log('Representative Fire profile detail responsive checks passed.');
      return;
    }

    for (const viewport of testViewports) {
      await checkProfileAtViewport(cdp, viewport);
    }
    for (const viewport of [
      { width: 320, height: 740, mobile: true },
      { width: 360, height: 844, mobile: true },
    ]) {
      for (const agencyName of emsProfileCases) {
        await checkEmsProfileAtViewport(cdp, viewport, agencyName);
      }
      for (const agencyName of fireProfileCases) {
        await checkFireProfileAtViewport(cdp, viewport, agencyName);
      }
      assertFireOperationsDifferAtViewport(viewport);
    }
    for (const viewport of [
      { width: 390, height: 844, mobile: true },
      { width: 1280, height: 900, mobile: false },
    ]) {
      await checkFireProfileAtViewport(cdp, viewport);
    }
    for (const viewport of landscapeFireViewports) {
      for (const agencyName of fireProfileCases) {
        await checkFireProfileAtViewport(cdp, viewport, agencyName);
      }
    }
    for (const viewport of countyCardViewports) {
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

export { createCdpClient, evaluate, waitFor, reservePort, waitForJson, clickVisibleButton };

if (process.env.PROFILE_HELPERS_ONLY !== '1') {
  main().catch((error) => {
    console.error(`Responsive browser check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
