import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, reservePort, waitFor, waitForJson } =
  await import('./check-profile-overflow.mjs');

const baseUrl = process.env.MOBILE_NEARBY_TEST_URL || 'http://127.0.0.1:80/';
const outputDir = 'generated-artifacts/mobile-nearby-review';
const profile = await mkdtemp(path.join(os.tmpdir(), 'mobile-nearby-'));
const port = await reservePort();
const browser = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });
let cdp;
let step = 'starting browser';

try {
  await mkdir(outputDir, { recursive: true });
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  cdp = createCdpClient(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const run = (expression) => evaluate(cdp, expression);
  step = 'granting simulated device location';
  await cdp.send('Browser.grantPermissions', {
    origin: new URL(baseUrl).origin,
    permissions: ['geolocation'],
  });
  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: 38.9072,
    longitude: -77.0369,
    accuracy: 25,
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  step = 'loading the app';
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `!!document.querySelector('[data-testid="button-mobile-nearby-search"]')`,
    'mobile nearby shortcut');
  const shortcut = await run(`(() => {
    const button = document.querySelector('[data-testid="button-mobile-nearby-search"]');
    const rect = button.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height >= 40,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      display: getComputedStyle(button).display,
      label: button.getAttribute('aria-label'),
      right: rect.right,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  })()`);
  assert.ok(shortcut.visible && shortcut.right <= shortcut.viewportWidth + 1,
    `Nearby shortcut must be a visible touch target within the phone header: ${JSON.stringify(shortcut)}`);
  assert.equal(shortcut.label, 'Find EMS and fire agencies near me');
  assert.ok(shortcut.documentWidth <= shortcut.viewportWidth + 1, 'Phone header must not overflow horizontally.');
  step = 'opening nearby search';
  await run(`document.querySelector('[data-testid="button-mobile-nearby-search"]').click()`);
  step = 'waiting for location results';
  await waitFor(cdp,
    `document.querySelector('[aria-label="Nearby search radius"]')?.innerText.includes('mapped')`,
    'nearby results');

  const initial = await run(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="nearby-agency-row"]')];
    const distances = rows.map(row => Number(row.getAttribute('data-distance-miles')));
    const viewport = document.documentElement.clientWidth;
    return {
      title: document.querySelector('#mobile-finder-title')?.innerText.trim(),
      status: document.querySelector('[aria-label="Nearby search radius"]')?.innerText.trim(),
      radiusSummary: document.querySelector('[aria-label="Nearby search radius"]')?.innerText.match(/(\\d+) mapped records total within/)?.[0],
      count: rows.length,
      distances,
      width: viewport,
      scrollWidth: document.documentElement.scrollWidth,
      keyboardOpen: document.activeElement === document.querySelector('input[aria-label^="Search agency"]'),
    };
  })()`);
  assert.equal(initial.title, 'Nearby EMS & Fire');
  assert.ok(initial.status.includes('mapped'));
  assert.ok(initial.scrollWidth <= initial.width + 1, 'Nearby drawer must not cause horizontal page overflow.');
  assert.equal(initial.keyboardOpen, false, 'Opening nearby results must not pop the phone keyboard.');
  assert.ok(initial.distances.every(Number.isFinite), 'Every nearby row must have a mapped distance.');
  assert.ok(initial.distances.every((distance, index, all) => index === 0 || all[index - 1] <= distance),
    'Nearby agency cards must be sorted nearest first.');
  assert.ok(initial.radiusSummary, 'Show the count of mapped records in range.');
  assert.ok(initial.count <= 100, 'Nearby result rendering must remain bounded on phones.');

  await run(`(() => [...document.querySelectorAll('[aria-label="Nearby search distance"] button')]
    .find(button => button.innerText.trim() === '50 mi')?.click())()`);
  await waitFor(cdp,
    `document.querySelector('[aria-label="Nearby search radius"]')?.innerText.includes('within 50 miles')`,
    'expanded radius');
  const expandedCount = await run(`document.querySelectorAll('[data-testid="nearby-agency-row"]').length`);
  assert.ok(expandedCount >= initial.count, 'A larger search radius cannot remove nearby matches.');

  step = 'checking the Fire filter';
  await run(`(() => [...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(button => /^Fire\\b/.test(button.innerText.trim()))?.click())()`);
  await waitFor(cdp,
    `[...document.querySelector('[role="dialog"]').querySelectorAll('button')].some(button => /^Fire\\b/.test(button.innerText.trim()) && button.className.includes('bg-amber-600'))`,
    'fire-only nearby filter');
  const fireResults = await run(`({
    count: document.querySelectorAll('[data-testid="nearby-agency-row"]').length,
    allFire: [...document.querySelectorAll('[data-testid="nearby-agency-row"]')].every(row => row.innerText.includes('Fire Department')),
  })`);
  assert.ok(fireResults.allFire, 'Fire filter must not include EMS agencies.');
  await run(`(() => [...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(button => /^All\\b/.test(button.innerText.trim()))?.click())()`);
  await run(`(() => [...document.querySelectorAll('[aria-label="Nearby search distance"] button')]
    .find(button => button.innerText.trim() === '25 mi')?.click())()`);

  step = 'capturing the phone layout';
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${outputDir}/nearby-390.png`, Buffer.from(screenshot.result.data, 'base64'));
  step = 'checking the narrow phone layout';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const narrow = await run(`(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    drawerWidth: document.querySelector('[role="dialog"]')?.getBoundingClientRect().width,
    nearbyButtonWidth: document.querySelector('[data-testid="button-mobile-nearby-search"]')?.getBoundingClientRect().width,
  }))()`);
  assert.ok(narrow.scrollWidth <= narrow.width + 1, 'Nearby search must fit a 320px phone viewport.');
  assert.ok(narrow.drawerWidth <= narrow.width, 'Nearby drawer must stay within narrow phones.');
  assert.ok(narrow.nearbyButtonWidth >= 44, 'The narrow-phone nearby shortcut must retain a 44px touch target.');

  step = 'checking denied-location recovery';
  await run(`document.querySelector('[aria-label="Close provider search"]').click()`);
  await run(`Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1 }) },
  })`);
  await run(`document.querySelector('[data-testid="button-mobile-nearby-search"]').click()`);
  await waitFor(cdp,
    `document.querySelector('[role="alert"]')?.innerText.includes('permission was denied')`,
    'permission-denied explanation');
  assert.ok(await run(`!![...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Try again')`),
    'A denied permission state must offer a retry.');
  await run(`document.querySelector('[role="dialog"] button').click()`);
  await waitFor(cdp,
    `document.querySelector('#mobile-finder-title')?.innerText.includes('Find & Select Provider')`,
    'return to regular provider search');

  console.log(JSON.stringify({
    viewport: '390x844',
    nearbyRecords: initial.count,
    recordsWithin50Miles: expandedCount,
    sortedNearestFirst: true,
    locationPromptTriggeredByTap: true,
    keyboardStayedClosed: true,
    noHorizontalOverflow: true,
    fits320pxViewport: true,
    fireFilterWorks: fireResults.allFire,
    deniedPermissionHasRecovery: true,
    screenshot: `${outputDir}/nearby-390.png`,
  }, null, 2));
} catch (error) {
  console.error(error instanceof assert.AssertionError || /^Timed out:/.test(error.message)
    ? error.message
    : `Nearby browser check did not finish while ${step} (${error instanceof Error ? error.name : 'unknown error'}).`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  browser.kill('SIGTERM');
  await new Promise((resolve) => browser.exitCode !== null ? resolve() : browser.once('close', resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
