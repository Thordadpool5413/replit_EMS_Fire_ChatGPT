// Real SDK regression check. Uses browser-only synthetic agencies, never a mock map.
// Run against the running Vite artifact: LIVE_MAP_TEST_URL=https://<dev-host>/ node scripts/check-live-agency-map.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.LIVE_MAP_TEST_URL;
assert(baseUrl, 'Set LIVE_MAP_TEST_URL to the running development artifact URL.');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(os.tmpdir(), 'live-agency-map-'));
const browser = spawn(process.env.CHROMIUM_PATH ?? 'chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
let socket;
try {
  const { readFile } = await import('node:fs/promises');
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
    catch { await pause(100); }
  }
  assert(port, 'Chromium debugging endpoint did not start.');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    // Never emit protocol response text: it can contain SDK URLs and keys.
    if (message.error) request.reject(new Error(`Browser command failed: ${request.method}`));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, 30_000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const description = result.exceptionDetails?.exception?.description ?? '';
    const kind = ['Failed to fetch dynamically imported module', 'Invalid hook call', 'Cannot read properties of undefined', 'Cannot read properties of null', 'not a function', 'not defined', 'preamble'].find((kind) => description.includes(kind)) ?? 'unclassified';
    assert(!result.exceptionDetails, `In-page check failed at ${expression.slice(0, 65)} (${kind}; line ${result.exceptionDetails?.lineNumber}; exception details withheld to protect credentials).`);
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(expression)) return;
      await pause(250);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const click = async (selector) => {
    assert(await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.click(); return !!el; })()`), `Missing control: ${selector}`);
    await pause(1200);
  };
  const camera = () => evaluate(`(() => { const m = window.__liveMap; return { center: m.getCenter().toJSON(), zoom: m.getZoom(), scrollY }; })()`);
  const sameCamera = (a, b) => Math.abs(a.center.lat - b.center.lat) < 0.0001 &&
    Math.abs(a.center.lng - b.center.lng) < 0.0001 && Math.abs(a.zoom - b.zoom) < 0.001;

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await waitFor(`!!document.querySelector('#root')?.children.length`, 'app startup');
  // Mount the unchanged production component with explicit finite edge-case data.
  // The component resolves its own configured key; this harness never reads it.
  await evaluate(`(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { GoogleMapsTerritoryExplorer } = await import('/src/components/GoogleMapsTerritoryExplorer.tsx');
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    const agency = (id, latitude, longitude, score, category = 'EMS') => ({
      id, name: 'Map regression ' + id, fdid: id, latitude, longitude,
      stateCode: 'IL', county: 'Cook', city: 'Chicago', agencyType: category,
      providerCategory: category, zipCode: '60601',
      installedFleet: { defibUnitsCount: 1, defibBrand: 'Test' },
      zollOpportunity: { pulseIqScore: score, priorityTier: 'High Value' }
    });
    window.__mapFixtureAgencies = [
      agency('single', 41.88, -87.63, 10),
      agency('overlap-a', 41.88, -87.63, 20),
      agency('overlap-b', 41.88, -87.63, 20),
      agency('east', 41.8, -87.1, 30, 'FIRE'),
      agency('west', 42.1, -88.5, 30)
    ];
    function Fixture() {
      const [category, setCategory] = React.useState('all');
      const [county, setCounty] = React.useState('Cook');
      window.__setMapCounty = setCounty;
      return React.createElement(React.Fragment, null,
        React.createElement('div', { style: { height: 160 } }, 'Live map regression fixture'),
        React.createElement(GoogleMapsTerritoryExplorer, {
          agencies: window.__mapFixtureAgencies, globalState: 'IL', globalCounty: county,
          globalCategory: category, onSelectCategory: setCategory, onSelectAgency: () => {}
        }),
        React.createElement('div', { style: { height: 1200 } }, 'Page scroll target'));
    }
    createRoot(host).render(React.createElement(Fixture));
  })()`);
  await waitFor(`!!window.google?.maps?.Map && !!document.querySelector('[data-testid="button-gmap-fit-area"]')`, 'real Google SDK and Fit area');
  await evaluate(`(() => {
    const original = google.maps.Map.prototype.moveCamera;
    google.maps.Map.prototype.moveCamera = function(options) {
      window.__liveMap = this; return original.call(this, options);
    };
    window.__setMapCounty('Empty');
  })()`);
  await waitFor(`!!window.__liveMap`, 'real map instance');
  await evaluate(`window.__setMapCounty('Cook')`);
  await pause(1500);
  assert(await evaluate(`window.__liveMap instanceof google.maps.Map`), 'Expected the real Google Map.');
  assert(await evaluate(`window.__liveMap.get('gestureHandling') === 'cooperative'`), 'Cooperative gestures not configured.');

  const setRange = async (min, max) => {
    await evaluate(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [id, value] of [['pulseiq-range-min', '${min}'], ['pulseiq-range-max', '${max}']]) {
        const input = document.querySelector('[data-testid="' + id + '"]');
        setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await pause(1500);
  };
  await click('[data-testid="button-gmap-fit-area"]');
  assert(await evaluate(`window.__mapFixtureAgencies.every(a => window.__liveMap.getBounds().contains({lat:a.latitude,lng:a.longitude}))`), 'Fit area missed a plotted agency.');
  console.log('PASS multiple: Fit area contains all five source coordinates, including overlap members.');

  await evaluate(`window.__liveMap.getDiv().scrollIntoView({block:'center'})`);
  const rect = await evaluate(`window.__liveMap.getDiv().getBoundingClientRect().toJSON()`);
  const beforeDrag = await camera();
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.width * 0.4, y: rect.y + rect.height * 0.6 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + rect.width * 0.4, y: rect.y + rect.height * 0.6, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.width * 0.4 + i * 12, y: rect.y + rect.height * 0.6, button: 'left', buttons: 1 });
    await pause(25);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + rect.width * 0.4 + 120, y: rect.y + rect.height * 0.6, button: 'left', clickCount: 1 });
  await pause(1500);
  const afterDrag = await camera();
  assert(!sameCamera(beforeDrag, afterDrag), 'Mouse drag did not move camera.');
  // A real SDK zoom control, not a programmatic camera update.
  await click('button[aria-label="Zoom in"]');
  const afterZoom = await camera();
  assert(afterZoom.zoom > afterDrag.zoom, 'Zoom in did not change zoom.');
  assert(await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Terrain'); b?.click(); return !!b; })()`), 'Missing Terrain control.');
  await pause(2000);
  assert(sameCamera(afterZoom, await camera()), 'Unrelated style rerender or idle reset camera.');
  console.log('PASS camera: desktop drag and zoom persist through idle and map-style rerender.');

  await setRange(10, 10);
  let target = await camera();
  assert(Math.abs(target.center.lat - 41.88) < 0.0001 && target.zoom === 10, 'Filter did not update territory target.');
  await click('[data-testid="button-gmap-fit-area"]');
  target = await camera();
  assert(target.zoom === 12 && Math.abs(target.center.lng + 87.63) < 0.0001, 'Single-marker fit incorrect.');
  console.log('PASS single: filtering moves to the target; Fit area centers the agency at zoom 12.');

  await setRange(100, 100);
  await click('[data-testid="button-gmap-fit-area"]');
  target = await camera();
  assert(Math.abs(target.center.lat - 40) < 0.0001 && Math.abs(target.center.lng + 89) < 0.0001 && target.zoom === 10, `Empty fallback incorrect: ${JSON.stringify(target)}`);
  console.log('PASS zero: Fit area returns to the empty-territory fallback without invalid bounds.');

  await setRange(20, 20);
  await click('[data-testid="button-gmap-fit-area"]');
  assert(await evaluate(`window.__liveMap.getBounds().contains({lat:41.88,lng:-87.63})`), 'Overlap coordinates outside fit.');
  assert(await evaluate(`!!document.querySelector('[aria-label^="2 overlapping agencies"]')`), 'Identical coordinates lost their overlap cluster.');
  console.log('PASS overlap: coincident agencies remain clustered and within Fit area.');

  await click('[data-testid="pulseiq-range-clear"]');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await evaluate(`window.__liveMap.getDiv().scrollIntoView({block:'center'})`);
  await pause(1000);
  const touchRect = await evaluate(`window.__liveMap.getDiv().getBoundingClientRect().toJSON()`);
  const x = touchRect.x + touchRect.width * 0.5;
  const y = touchRect.y + touchRect.height * 0.6;
  const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 5, radiusY: 5, force: 1 })) });
  const beforeTouch = await camera();
  await touch('touchStart', [[1, x, y]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[1, x, y - i * 10]]); await pause(35); }
  await touch('touchEnd', []);
  await pause(1500);
  const afterTouch = await camera();
  assert(Math.abs(afterTouch.scrollY - beforeTouch.scrollY) > 30, 'One-finger map gesture trapped page scrolling.');
  assert(sameCamera(beforeTouch, afterTouch), 'One finger panned cooperative map instead of page.');
  console.log('PASS phone: a one-finger touch scrolls the page without moving the camera.');

  await evaluate(`window.__liveMap.getDiv().scrollIntoView({block:'center'})`);
  await pause(500);
  const r = await evaluate(`window.__liveMap.getDiv().getBoundingClientRect().toJSON()`);
  const tx = r.x + r.width * 0.5, ty = r.y + r.height * 0.55;
  const beforeTwo = await camera();
  await touch('touchStart', [[1, tx - 35, ty], [2, tx + 35, ty]]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [[1, tx - 35 - i * 4, ty - i * 3], [2, tx + 35 + i * 4, ty - i * 3]]);
    await pause(35);
  }
  await touch('touchEnd', []);
  await pause(1500);
  const afterTwo = await camera();
  assert(afterTwo.zoom > beforeTwo.zoom && !sameCamera(beforeTwo, afterTwo), 'Two-finger gesture did not move/zoom map.');
  assert(Math.abs(afterTwo.scrollY - beforeTwo.scrollY) < 5, 'Two-finger map gesture scrolled page.');
  console.log('PASS phone: two-finger gesture pans/zooms the real map without scrolling the page.');
  console.log('Live Google SDK regression checks passed. No credentials were read or logged.');
} catch (error) {
  // Print only authored assertion messages, never raw browser/SDK errors or URLs.
  console.error(error instanceof assert.AssertionError || /^(Timed out:|Browser command)/.test(error.message)
    ? error.message : 'Live map check could not finish; browser error details withheld.');
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await new Promise((resolve) => browser.exitCode !== null ? resolve() : browser.once('close', resolve));
  // Chromium child processes can finish writing the profile just after the parent exits.
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
