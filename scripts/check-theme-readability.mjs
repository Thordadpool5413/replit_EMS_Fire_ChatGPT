import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { gisGroupTimeout, planGisGroups } from './lib/theme-gis-groups.mjs';

const baseUrl = process.env.THEME_TEST_URL ?? `http://127.0.0.1:${process.env.PORT ?? '24938'}/`;
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const allViewports = [
  { width: 1366, height: 768, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 767, height: 1024, mobile: true },
  { width: 768, height: 1024, mobile: false },
  { width: 820, height: 1180, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const gisLayers = [
  {
    name: 'OHCA',
    button: 'OHCA Rate / 1k Transports',
    tiers: [
      { id: 'critical', label: 'Top 10%', swatchClass: 'bg-rose-500' },
      { id: 'high', label: '75th–90th percentile', swatchClass: 'bg-orange-500' },
      { id: 'moderate', label: '50th–75th percentile', swatchClass: 'bg-amber-400' },
      { id: 'baseline', label: 'Below national median rate', swatchClass: 'bg-sky-400' },
      { id: 'unreported', label: 'No paired OHCA / transport report', swatchClass: 'bg-slate-500' },
    ],
    markerColors: ['#be123c', '#ea580c', '#d97706', '#0284c7', '#64748b'],
  },
  {
    name: 'Survival',
    button: 'Survival Deficit',
    tiers: [
      { id: 'critical', label: '<22% Survival (Critical)', swatchClass: 'bg-red-500' },
      { id: 'high', label: '22–<26% Survival (High)', swatchClass: 'bg-orange-500' },
      { id: 'moderate', label: '26–<30% Survival (Moderate)', swatchClass: 'bg-amber-400' },
      { id: 'benchmark', label: '≥30% Survival (Benchmark)', swatchClass: 'bg-emerald-500' },
    ],
    markerColors: ['#b91c1c', '#c2410c', '#d97706', '#059669', '#64748b'],
  },
  {
    name: 'AED',
    button: 'AED Need',
    tiers: [
      { id: 'critical', label: '≥55% Deficit (Severe)', swatchClass: 'bg-rose-500' },
      { id: 'high', label: '45–<55% Deficit (High)', swatchClass: 'bg-amber-500' },
      { id: 'moderate', label: '35–<45% Deficit (Moderate)', swatchClass: 'bg-teal-500' },
      { id: 'baseline', label: '<35% Deficit (Adequate)', swatchClass: 'bg-slate-400' },
    ],
    markerColors: ['#a21caf', '#0369a1', '#0f766e', '#475569', '#64748b'],
  },
  {
    name: 'Transport',
    button: 'Long Transport (>20 min)',
    tiers: [
      { id: 'critical', label: '≥28 min (Severe Delay)', swatchClass: 'bg-amber-500' },
      { id: 'high', label: '22–<28 min (Prolonged Transport)', swatchClass: 'bg-yellow-500' },
      { id: 'moderate', label: '16–<22 min (Standard Transport)', swatchClass: 'bg-sky-500' },
      { id: 'baseline', label: '<16 min (Rapid Urban Transit)', swatchClass: 'bg-emerald-500' },
    ],
    markerColors: ['#9a3412', '#c2410c', '#047857', '#0284c7', '#64748b'],
  },
];
const gisRiskLayers = [
  {
    name: 'Survival',
    button: 'Survival Deficit',
    id: 'cardiac',
    metric: 'survival deficit',
    low: 'Lower survival deficit',
    high: 'Higher survival deficit',
    meaning: 'lower = higher risk',
    stateColors: {
      critical: { dark: '#7f1d1d', light: '#fee2e2' },
      high: { dark: '#7c2d12', light: '#ffedd5' },
      moderate: { dark: '#713f12', light: '#fef9c3' },
      baseline: { dark: '#064e3b', light: '#d1fae5' },
    },
  },
  {
    name: 'AED',
    button: 'AED Need',
    id: 'aed',
    metric: 'AED access deficit',
    low: 'Lower AED access deficit',
    high: 'Higher AED access deficit',
    meaning: 'higher = greater need',
    stateColors: {
      critical: { dark: '#701a75', light: '#fae8ff' },
      high: { dark: '#0c4a6e', light: '#e0f2fe' },
      moderate: { dark: '#134e4a', light: '#ccfbf1' },
      baseline: { dark: '#1e293b', light: '#f1f5f9' },
    },
  },
  {
    name: 'Transport',
    button: 'Long Transport (>20 min)',
    id: 'transport',
    metric: 'transport time',
    low: 'Shorter transport time',
    high: 'Longer transport time',
    meaning: 'longer = greater delay',
    stateColors: {
      critical: { dark: '#7c2d12', light: '#ffedd5' },
      high: { dark: '#713f12', light: '#fef3c7' },
      moderate: { dark: '#0c4a6e', light: '#e0f2fe' },
      baseline: { dark: '#064e3b', light: '#f0fdf4' },
    },
  },
];
const requestedWidth = Number(process.env.THEME_TEST_WIDTH);
const viewports = requestedWidth
  ? allViewports.filter((viewport) => viewport.width === requestedWidth)
  : allViewports;

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

async function waitForJson(url, timeoutMs = 15_000, signal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
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
  let closed = false;
  const rejectPending = () => {
    for (const { reject, timeout } of pending.values()) {
      clearTimeout(timeout);
      reject(new Error('Chromium connection closed'));
    }
    pending.clear();
  };
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
    socket.addEventListener('close', () => reject(new Error('Chromium closed before connecting')), { once: true });
  });
  socket.addEventListener('close', rejectPending);

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
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
      if (closed || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('Chromium connection is not open'));
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          const error = new Error(`Timed out waiting for Chromium command: ${method}; check incomplete, not a visual assertion failure`);
          error.code = 'HARNESS_INCOMPLETE';
          reject(error);
        }, 30_000);
        pending.set(id, { resolve, reject, timeout, method });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timeout);
          pending.delete(id);
          reject(error);
        }
      });
    },
    close() {
      closed = true;
      rejectPending();
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  let response;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      response = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Inspected target navigated or closed') || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (response.result.exceptionDetails) {
    const details = response.result.exceptionDetails;
    const reason = details.exception?.description ?? details.exception?.value ?? details.text;
    throw new Error(`${reason}; expression: ${expression.slice(0, 220)}`);
  }
  return response.result.result.value;
}

async function waitFor(cdp, expression, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function clickVisible(cdp, selectorOrLabel, exactText = false) {
  const clicked = await evaluate(cdp, `(() => {
    const candidates = ${exactText
      ? `[...document.querySelectorAll('button')].filter((button) => button.innerText.trim() === ${JSON.stringify(selectorOrLabel)})`
      : `[...document.querySelectorAll(${JSON.stringify(selectorOrLabel)})]`};
    const button = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' &&
        style.display !== 'none' && rect.right > 0 && rect.left < innerWidth &&
        rect.bottom > 0 && rect.top < innerHeight;
    });
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${selectorOrLabel}`);
}

async function clickButtonAndScroll(cdp, label) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.innerText.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    button.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${label}`);
}

async function clickTestIdAndScroll(cdp, testId) {
  const result = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="${testId}"]');
    if (!button) return { clicked: false, reason: 'missing test id' };
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return { clicked: false, reason: 'button is hidden' };
    }
    button.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    button.click();
    return { clicked: true };
  })()`);
  assert(result.clicked, `Could not click ${testId}: ${result.reason}`);
}

function themeModeName(themeMode) {
  if (typeof themeMode === 'string') return themeMode;
  return themeMode ? 'dark' : 'daylight';
}

function themeLabel(themeMode) {
  const mode = themeModeName(themeMode);
  if (mode === 'daylight') return 'light';
  if (mode === 'dark') return 'dark';
  return 'Miami Vice';
}

async function captureThemeScreenshot(cdp, requestedThemeMode, name) {
  const captureDirectory = process.env.THEME_TEST_CAPTURE_DIR;
  if (!captureDirectory || themeModeName(requestedThemeMode) !== 'miami-vice') return;
  await mkdir(captureDirectory, { recursive: true });
  const image = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const width = await evaluate(cdp, 'innerWidth');
  await writeFile(
    path.join(captureDirectory, `${name}-${width}.png`),
    Buffer.from(image.result.data, 'base64'),
  );
}

async function setTheme(cdp, requestedThemeMode) {
  const themeMode = themeModeName(requestedThemeMode);
  const isDark = themeMode !== 'daylight';
  const isMobile = await evaluate(cdp, 'innerWidth < 768');
  const testId = isMobile ? 'theme-select-mobile' : 'theme-select-desktop';

  if (isMobile) {
    await evaluate(cdp, 'window.scrollTo({ top: 0, behavior: "instant" })');
    const selectorAlreadyVisible = await evaluate(cdp, `(() => {
      const select = document.querySelector('[data-testid="${testId}"]');
      const rect = select?.getBoundingClientRect();
      return Boolean(select && rect && rect.width > 0 && rect.height > 0);
    })()`);
    const toolsMenuAlreadyOpen = await evaluate(cdp, `document.querySelector('button[aria-label="Workspace tools"]')?.getAttribute('aria-expanded') === 'true'`);
    if (!selectorAlreadyVisible && !toolsMenuAlreadyOpen) {
      await waitFor(
        cdp,
        `(() => {
          const button = document.querySelector('button[aria-label="Workspace tools"]');
          const rect = button?.getBoundingClientRect();
          return Boolean(button && rect && rect.width > 0 && rect.height > 0);
        })()`,
        'mobile workspace tools button',
      );
      await clickVisible(cdp, 'button[aria-label="Workspace tools"]');
    }
  }
  const selectorExpression = `(() => {
    const select = document.querySelector('[data-testid="${testId}"]');
    const rect = select?.getBoundingClientRect();
    return Boolean(select && rect && rect.width > 0 && rect.height > 0);
  })()`;
  try {
    await waitFor(
      cdp,
      selectorExpression,
      `${themeLabel(themeMode)} theme selector`,
      10_000,
    );
  } catch (error) {
    const state = await evaluate(cdp, `(() => {
      const select = document.querySelector('[data-testid="${testId}"]');
      const rect = select?.getBoundingClientRect();
      const style = select ? getComputedStyle(select) : null;
      const menu = document.querySelector('#mobile-workspace-tools-menu');
      const trigger = document.querySelector('button[aria-label="Workspace tools"]');
      return {
        selector: Boolean(select),
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        display: style?.display ?? null,
        visibility: style?.visibility ?? null,
        menu: Boolean(menu),
        menuText: menu?.innerText.trim().slice(0, 120) ?? '',
        triggerExpanded: trigger?.getAttribute('aria-expanded') ?? null,
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`);
    throw new Error(`${error.message}; mobile selector state: ${JSON.stringify(state)}`);
  }
  const selectionDispatched = await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="${testId}"]');
    if (!select || ![...select.options].some((option) => option.value === ${JSON.stringify(themeMode)})) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(select, ${JSON.stringify(themeMode)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value === ${JSON.stringify(themeMode)};
  })()`);
  assert(selectionDispatched, `Could not choose ${themeLabel(themeMode)} from the theme selector`);
  await waitFor(
    cdp,
    `document.documentElement.dataset.theme === ${JSON.stringify(themeMode)} &&
      document.documentElement.classList.contains('dark') === ${isDark} &&
      localStorage.getItem('app_theme_mode') === ${JSON.stringify(themeMode)}`,
    `${themeLabel(themeMode)} theme application and persistence`,
  );
  const saved = await evaluate(cdp, `({
    mode: localStorage.getItem('app_theme_mode'),
    legacyDarkMode: localStorage.getItem('app_dark_mode'),
  })`);
  assert(saved.legacyDarkMode === String(isDark), `${themeLabel(themeMode)} did not keep the legacy dark-mode preference in sync`);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function reloadAndWaitForTheme(cdp, themeMode, description) {
  await cdp.send('Page.reload');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.home-map-state-path')) &&
      document.documentElement.dataset.theme === ${JSON.stringify(themeMode)}`,
    description,
  );
}

async function checkThemeModeSelection(cdp, viewport) {
  await evaluate(cdp, `(() => {
    localStorage.removeItem('app_theme_mode');
    localStorage.setItem('app_dark_mode', 'false');
  })()`);
  await reloadAndWaitForTheme(cdp, 'daylight', 'legacy Daylight preference migration');

  let navigationGeometry = null;
  for (const themeMode of ['daylight', 'dark', 'miami-vice']) {
    await setTheme(cdp, themeMode);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const state = await evaluate(cdp, `(() => {
      const active = document.querySelector('.pi-primary-nav [aria-current="page"]');
      const activeStyle = active ? getComputedStyle(active) : null;
      const root = document.documentElement;
      const probe = document.createElement('span');
      probe.style.color = 'var(--pi-accent-highlight)';
      document.body.appendChild(probe);
      const accentColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        mode: root.dataset.theme,
        darkClass: root.classList.contains('dark'),
        selectedValue: localStorage.getItem('app_theme_mode'),
        legacyValue: localStorage.getItem('app_dark_mode'),
        accent: getComputedStyle(root).getPropertyValue('--pi-accent-highlight').trim(),
        canvas: getComputedStyle(root).getPropertyValue('--pi-canvas-bg').trim(),
        surface: getComputedStyle(root).getPropertyValue('--pi-surface-bg').trim(),
        subtleSurface: getComputedStyle(root).getPropertyValue('--pi-surface-subtle').trim(),
        primaryText: getComputedStyle(root).getPropertyValue('--pi-text-primary').trim(),
        action: getComputedStyle(root).getPropertyValue('--pi-action').trim(),
        legacyCanvas: getComputedStyle(root).getPropertyValue('--bg-canvas').trim(),
        colorScheme: root.style.colorScheme,
        activeBorder: activeStyle?.borderLeftColor ?? '',
        activeBorderWidth: activeStyle?.borderLeftWidth ?? '',
        activeHtml: active?.outerHTML ?? '',
        accentColor,
        navigationGeometry: (() => {
          const nav = innerWidth < 768
            ? document.querySelector('.pi-mobile-nav')
            : document.querySelector('.pi-primary-sidebar');
          const item = innerWidth < 768
            ? nav?.querySelector('button[aria-current="page"]')
            : nav?.querySelector('.pi-primary-nav button');
          const navRect = nav?.getBoundingClientRect();
          const itemRect = item?.getBoundingClientRect();
          return {
            width: Math.round(navRect?.width ?? 0),
            height: Math.round(navRect?.height ?? 0),
            itemHeight: Math.round(itemRect?.height ?? 0),
            fontSize: item ? getComputedStyle(item).fontSize : '',
          };
        })(),
      };
    })()`);
    assert(state.mode === themeMode, `Theme selector did not apply ${themeLabel(themeMode)}`);
    assert(state.darkClass === (themeMode !== 'daylight'), `${themeLabel(themeMode)} did not set the expected color scheme`);
    assert(state.selectedValue === themeMode, `${themeLabel(themeMode)} selection was not saved`);
    assert(state.legacyValue === String(themeMode !== 'daylight'), `${themeLabel(themeMode)} did not preserve legacy preference compatibility`);
    if (navigationGeometry === null) navigationGeometry = state.navigationGeometry;
    else {
      assert(
        JSON.stringify(state.navigationGeometry) === JSON.stringify(navigationGeometry),
        `${themeLabel(themeMode)} changed navigation sizing: ${JSON.stringify({ before: navigationGeometry, after: state.navigationGeometry })}`,
      );
    }
    if (!viewport.mobile) {
      assert(
        state.navigationGeometry.width >= 208 && state.navigationGeometry.itemHeight >= 32,
        `Desktop navigation is too compressed: ${JSON.stringify(state.navigationGeometry)}`,
      );
    }
    if (themeMode === 'miami-vice') {
      assert(state.darkClass && state.colorScheme === 'dark', `Miami Vice should use its cinematic dark surfaces: ${JSON.stringify(state)}`);
      assert(
        state.canvas === '#0e1428' &&
          state.surface === '#171f38' &&
          state.subtleSurface === '#202a46' &&
          state.primaryText === '#f7f3f7' &&
          state.action === '#087d88' &&
          state.legacyCanvas === state.canvas,
        `Miami Vice midnight/neon palette or legacy aliases are missing: ${JSON.stringify(state)}`,
      );
      assert(state.accent === '#ff5aa8', `Miami Vice neon-pink accent token is missing: ${JSON.stringify(state)}`);
      assert(state.activeBorder === state.accentColor, `Miami Vice active navigation accent is missing: ${JSON.stringify(state)}`);
      assert(state.activeBorderWidth === '3px', `Miami Vice selected navigation should have the visible neon indicator: ${JSON.stringify(state)}`);
      await captureThemeScreenshot(cdp, themeMode, 'home');
    }
  }

  await reloadAndWaitForTheme(cdp, 'daylight', 'Daylight startup after selecting another theme');
  await waitFor(
    cdp,
    `localStorage.getItem('app_theme_mode') === 'daylight' &&
      localStorage.getItem('app_dark_mode') === 'false'`,
    'the saved theme to be reset to Daylight for the new app session',
  );
  await evaluate(cdp, `(() => {
    localStorage.setItem('app_theme_mode', 'dark');
    localStorage.setItem('app_dark_mode', 'true');
  })()`);
  await reloadAndWaitForTheme(cdp, 'daylight', 'Daylight startup despite saved dark preferences');
  await waitFor(
    cdp,
    `localStorage.getItem('app_theme_mode') === 'daylight' &&
      localStorage.getItem('app_dark_mode') === 'false'`,
    'saved dark preferences to be reset to Daylight on app startup',
  );
  console.log(`  ${viewport.width}px: all three theme options work in-session; every new app session starts in Daylight`);
}

async function checkThemeSelectionWithKeyboard(cdp, viewport) {
  const selector = viewport.mobile
    ? '[data-testid="theme-select-mobile"]'
    : '[data-testid="theme-select-desktop"]';
  if (viewport.mobile) {
    await clickVisible(cdp, 'button[aria-label="Workspace tools"]');
    await waitFor(cdp, `Boolean(document.querySelector('#mobile-workspace-tools-menu'))`, 'mobile workspace tools menu');
  }

  for (const themeMode of ['dark', 'miami-vice']) {
    const selectorState = await evaluate(cdp, `(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!select) return null;
      const rect = select.getBoundingClientRect();
      const style = getComputedStyle(select);
      if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') return null;
      return { value: select.value, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    assert(selectorState, `Could not locate visible ${viewport.mobile ? 'mobile' : 'desktop'} theme selector`);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: selectorState.x,
      y: selectorState.y,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: selectorState.x,
      y: selectorState.y,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: selectorState.x,
      y: selectorState.y,
      button: 'left',
      clickCount: 1,
    });
    const options = ['daylight', 'dark', 'miami-vice'];
    const distance = options.indexOf(themeMode) - options.indexOf(selectorState.value);
    for (let step = 0; step < Math.abs(distance); step += 1) {
      const key = distance > 0 ? 'ArrowDown' : 'ArrowUp';
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    await waitFor(
      cdp,
      `document.documentElement.dataset.theme === ${JSON.stringify(themeMode)} &&
        localStorage.getItem('app_theme_mode') === ${JSON.stringify(themeMode)}`,
      `${themeLabel(themeMode)} keyboard selection`,
    );
    if (viewport.mobile) {
      await waitFor(cdp, `!document.querySelector('#mobile-workspace-tools-menu')`, 'mobile tools menu close after theme selection');
      await clickVisible(cdp, 'button[aria-label="Workspace tools"]');
      await waitFor(cdp, `Boolean(document.querySelector('#mobile-workspace-tools-menu'))`, 'mobile workspace tools menu reopen');
    }
  }
  await cdp.send('Page.reload');
  await waitFor(
    cdp,
    `document.documentElement.dataset.theme === 'daylight' &&
      document.documentElement.style.colorScheme === 'light' &&
      localStorage.getItem('app_theme_mode') === 'daylight' &&
      localStorage.getItem('app_dark_mode') === 'false'`,
    `${viewport.width}px Daylight startup after keyboard-selecting another theme`,
  );
  console.log(`  ${viewport.width}px: pointer/keyboard theme selection works; reload restores Daylight`);
}

async function contrastReadings(cdp, selectors) {
  return evaluate(cdp, `(() => {
    const parse = (value) => {
      const oklab = value.match(/oklab\\(\\s*([+-]?[\\d.]+)\\s+([+-]?[\\d.]+)\\s+([+-]?[\\d.]+)(?:\\s*\\/\\s*([\\d.]+)%?)?\\s*\\)/i);
      if (oklab) {
        const lightness = Number(oklab[1]);
        const a = Number(oklab[2]);
        const b = Number(oklab[3]);
        const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
        const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
        const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
        const l = lRoot ** 3;
        const m = mRoot ** 3;
        const s = sRoot ** 3;
        const linear = [
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ];
        const rgb = linear.map((channel) => {
          const encoded = channel <= 0.0031308
            ? 12.92 * channel
            : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
          return Math.max(0, Math.min(255, encoded * 255));
        });
        return { rgb, alpha: oklab[4] ? Number(oklab[4].replace('%', '')) / (oklab[4].includes('%') ? 100 : 1) : 1 };
      }
      const oklch = value.match(/oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+)%?)?\\s*\\)/i);
      if (oklch) {
        const lightness = Number(oklch[1]);
        const chroma = Number(oklch[2]);
        const hue = Number(oklch[3]) * Math.PI / 180;
        const a = chroma * Math.cos(hue);
        const b = chroma * Math.sin(hue);
        const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
        const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
        const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
        const l = lRoot ** 3;
        const m = mRoot ** 3;
        const s = sRoot ** 3;
        const linear = [
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ];
        const rgb = linear.map((channel) => {
          const encoded = channel <= 0.0031308
            ? 12.92 * channel
            : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
          return Math.max(0, Math.min(255, encoded * 255));
        });
        return { rgb, alpha: oklch[4] ? Number(oklch[4].replace('%', '')) / (oklch[4].includes('%') ? 100 : 1) : 1 };
      }
      const srgb = value.match(/color\\(\\s*srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+)%?)?\\s*\\)/i);
      if (srgb) {
        return {
          rgb: srgb.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel) * 255))),
          alpha: srgb[4] ? Number(srgb[4].replace('%', '')) / (srgb[4].includes('%') ? 100 : 1) : 1,
        };
      }
      const channels = value.match(/[\\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) return null;
      return { rgb: channels.slice(0, 3), alpha: channels.length > 3 ? channels[3] : 1 };
    };
    const composite = (foreground, background) => {
      const alpha = foreground.alpha;
      return foreground.rgb.map((value, index) =>
        value * alpha + background.rgb[index] * (1 - alpha));
    };
    const luminance = (rgb) => {
      const [red, green, blue] = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const ratio = (foreground, background) => {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const samples = ${JSON.stringify(selectors)};
    return samples.map(({ name, selector, backgroundRgb, backgroundSelector }) => {
      const element = [...document.querySelectorAll(selector)].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' &&
          style.display !== 'none';
      });
      if (!element) return { name, missing: true };
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      const computedStyle = getComputedStyle(element);
      const foreground = parse(
        element.namespaceURI === 'http://www.w3.org/2000/svg'
          ? computedStyle.fill
          : computedStyle.color,
      );
      const backgrounds = [];
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        const value = parse(getComputedStyle(current).backgroundColor);
        if (value && value.alpha > 0) {
          backgrounds.push(value);
          if (value.alpha === 1) break;
        }
      }
      let background = { rgb: [255, 255, 255], alpha: 1 };
      for (const value of backgrounds.reverse()) {
        background = { rgb: composite(value, background), alpha: 1 };
      }
      if (backgroundSelector) {
        const backgroundElement = document.querySelector(backgroundSelector);
        const backgroundStyle = backgroundElement && getComputedStyle(backgroundElement);
        const explicitBackground = backgroundStyle && parse(backgroundStyle.backgroundColor);
        if (explicitBackground) {
          background = explicitBackground.alpha < 1
            ? { rgb: composite(explicitBackground, background), alpha: 1 }
            : { rgb: explicitBackground.rgb, alpha: 1 };
        }
      }
      if (backgroundRgb) background = { rgb: backgroundRgb, alpha: 1 };
      if (!foreground || !background) return { name, missing: false, unavailable: true };
      const resolvedForeground = foreground.alpha < 1
        ? composite(foreground, background)
        : foreground.rgb;
      return {
        name,
        missing: false,
        ratio: Number(ratio(resolvedForeground, background.rgb).toFixed(2)),
        foreground: getComputedStyle(element).color,
        background: 'rgb(' + background.rgb.map((channel) => Math.round(channel)).join(', ') + ')',
        text: (element.innerText ?? element.textContent ?? '').trim().slice(0, 100),
      };
    });
  })()`);
}

async function checkReadable(cdp, themeName, selectors) {
  const readings = await contrastReadings(cdp, selectors);
  for (const reading of readings) {
    assert(!reading.missing, `${themeName}: missing ${reading.name} readability sample`);
    assert(
      !reading.unavailable && reading.ratio >= 4.5,
      `${themeName}: ${reading.name} contrast is below 4.5:1: ${JSON.stringify(reading)}`,
    );
  }
  console.log(`  ${themeName}: ${readings.map(({ name, ratio }) => `${name} ${ratio}:1`).join(', ')}`);
}

async function checkThemeStates(cdp, dark, viewport) {
  await setTheme(cdp, dark);
  await evaluate(cdp, `(() => {
    document.querySelector('#theme-state-fixture')?.remove();
    const fixture = document.createElement('section');
    fixture.id = 'theme-state-fixture';
    fixture.style.cssText = 'position:fixed;left:0;top:0;width:620px;padding:12px;opacity:0;pointer-events:none;z-index:-1';
    fixture.innerHTML = \`
      <div data-testid="theme-card" class="bg-card text-card-foreground border border-border rounded-lg p-3">
        <h2 data-testid="theme-heading" class="text-foreground font-semibold">Theme heading</h2>
        <p data-testid="theme-supporting" class="text-muted-foreground">Supporting information remains readable.</p>
        <button data-testid="theme-selected" aria-pressed="true" class="rounded px-3 py-2">Selected</button>
        <button data-testid="theme-disabled" disabled class="rounded px-3 py-2">Unavailable</button>
        <div data-testid="theme-loading" class="animate-pulse rounded p-2">Loading</div>
        <div data-testid="theme-success" class="pi-status-success rounded p-2" role="status">Verified</div>
        <div data-testid="theme-warning" class="pi-status-warning rounded p-2" role="alert">Action required</div>
        <div data-testid="theme-critical" class="pi-status-critical rounded p-2" role="alert">Critical issue</div>
        <input data-testid="theme-input" aria-label="Theme test input" value="Focused control" />
      </div>\`;
    document.querySelector('.pi-app-shell')?.appendChild(fixture);
    return Boolean(fixture.parentElement);
  })()`);
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

  const fixtureState = await evaluate(cdp, `(() => {
    const fixture = document.querySelector('#theme-state-fixture');
    const get = (selector) => fixture?.querySelector(selector);
    const style = (selector) => getComputedStyle(get(selector));
    const success = get('[data-testid="theme-success"]');
    const warning = get('[data-testid="theme-warning"]');
    const critical = get('[data-testid="theme-critical"]');
    const resolveToken = (name, property) => {
      const probe = document.createElement('span');
      probe.style.setProperty(property, 'var(' + name + ')');
      fixture.appendChild(probe);
      return getComputedStyle(probe).getPropertyValue(property);
    };
    const loading = style('[data-testid="theme-loading"]');
    const disabled = style('[data-testid="theme-disabled"]');
    return {
      attached: Boolean(fixture?.parentElement),
      surfaceMatchesToken: style('[data-testid="theme-card"]').backgroundColor === resolveToken('--pi-surface-bg', 'background-color'),
      borderMatchesToken: style('[data-testid="theme-card"]').borderTopColor === resolveToken('--pi-border', 'border-color'),
      selectedMatchesBrand: style('[data-testid="theme-selected"]').backgroundColor === resolveToken('--pi-action', 'background-color') &&
        style('[data-testid="theme-selected"]').color === 'rgb(255, 255, 255)',
      disabledIsDimmed: get('[data-testid="theme-disabled"]').disabled && Number(disabled.opacity) < 1,
      loadingIsAnimated: loading.animationName !== 'none' && loading.animationDuration !== '0s',
      successMatchesToken: style('[data-testid="theme-success"]').backgroundColor === resolveToken('--pi-verified-bg', 'background-color') &&
        style('[data-testid="theme-success"]').color === resolveToken('--pi-verified-text', 'color'),
      successRole: success.getAttribute('role'),
      warningMatchesToken: style('[data-testid="theme-warning"]').backgroundColor === resolveToken('--pi-warning-bg', 'background-color') &&
        style('[data-testid="theme-warning"]').color === resolveToken('--pi-warning-text', 'color'),
      alertRole: warning.getAttribute('role'),
      criticalMatchesToken: style('[data-testid="theme-critical"]').backgroundColor === resolveToken('--pi-critical-bg', 'background-color') &&
        style('[data-testid="theme-critical"]').color === resolveToken('--pi-critical-text', 'color'),
      criticalRole: critical.getAttribute('role'),
      focusState: (() => {
        const input = get('[data-testid="theme-input"]');
        input.focus();
        const computed = getComputedStyle(input);
        return {
          active: document.activeElement === input,
          focusVisible: input.matches(':focus-visible'),
          border: computed.borderColor,
          action: resolveToken('--pi-action', 'border-color'),
          outline: computed.outlineColor,
          outlineWidth: computed.outlineWidth,
          focusRing: resolveToken('--pi-focus-ring', 'outline-color'),
        };
      })(),
    };
  })()`);

  assert(fixtureState.attached, 'Theme state fixture did not attach to the app');
  assert(fixtureState.surfaceMatchesToken, `${themeLabel(dark)} cards do not use the shared surface token`);
  assert(fixtureState.borderMatchesToken, `${themeLabel(dark)} cards do not use the shared border token`);
  assert(fixtureState.selectedMatchesBrand, `${themeLabel(dark)} selected controls do not use the brand action token`);
  assert(fixtureState.disabledIsDimmed, `${themeLabel(dark)} disabled controls are not visually distinct`);
  assert(fixtureState.loadingIsAnimated, `${themeLabel(dark)} loading state is not visibly animated`);
  assert(fixtureState.successMatchesToken && fixtureState.successRole === 'status', `${themeLabel(dark)} success status lost its semantic treatment`);
  assert(fixtureState.warningMatchesToken && fixtureState.alertRole === 'alert', `${themeLabel(dark)} warning state does not use semantic warning tokens`);
  assert(fixtureState.criticalMatchesToken && fixtureState.criticalRole === 'alert', `${themeLabel(dark)} critical status lost its semantic treatment`);
  assert(
    fixtureState.focusState.active && fixtureState.focusState.border === fixtureState.focusState.action,
    `${themeLabel(dark)} focused form control does not use the action token: ${JSON.stringify(fixtureState.focusState)}`,
  );
  assert(
    fixtureState.focusState.focusVisible && fixtureState.focusState.outlineWidth !== '0px' &&
      fixtureState.focusState.outline === fixtureState.focusState.focusRing,
    `${themeLabel(dark)} focus ring does not use the shared focus token: ${JSON.stringify(fixtureState.focusState)}`,
  );

  const readings = await contrastReadings(cdp, [
    { name: 'theme heading', selector: '#theme-state-fixture [data-testid="theme-heading"]' },
    { name: 'theme supporting text', selector: '#theme-state-fixture [data-testid="theme-supporting"]' },
    { name: 'selected control', selector: '#theme-state-fixture [data-testid="theme-selected"]' },
    { name: 'success status', selector: '#theme-state-fixture [data-testid="theme-success"]' },
    { name: 'warning status', selector: '#theme-state-fixture [data-testid="theme-warning"]' },
    { name: 'critical status', selector: '#theme-state-fixture [data-testid="theme-critical"]' },
  ]);
  for (const reading of readings) {
    assert(!reading.missing && !reading.unavailable && reading.ratio >= 4.5,
      `${themeLabel(dark)} ${reading.name} contrast is below 4.5:1: ${JSON.stringify(reading)}`);
  }
  await evaluate(cdp, `document.querySelector('#theme-state-fixture')?.remove()`);
  console.log(`  ${themeLabel(dark)} ${viewport.width}px theme states: shared surfaces, focus, selected, disabled, loading, and semantic statuses`);
}

async function checkActualDialogs(cdp, dark, viewport) {
  await setTheme(cdp, dark);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'k',
    code: 'KeyK',
    modifiers: 2,
    windowsVirtualKeyCode: 75,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'k',
    code: 'KeyK',
    modifiers: 2,
    windowsVirtualKeyCode: 75,
  });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[role="dialog"][aria-label="Agency and tool search"]'))`,
    'agency and tool search dialog',
  );
  await waitFor(
    cdp,
    `document.activeElement?.getAttribute('aria-label') === 'Search agencies and tools'`,
    'focused command palette search',
  );
  const commandDialog = await evaluate(cdp, `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Agency and tool search"]');
    const input = dialog?.querySelector('input[aria-label="Search agencies and tools"]');
    const style = input && getComputedStyle(input);
    return {
      modal: dialog?.getAttribute('aria-modal'),
      inputFocused: document.activeElement === input,
      focusVisible: input?.matches(':focus-visible'),
      outlineWidth: style?.outlineWidth ?? '0px',
      outlineStyle: style?.outlineStyle ?? 'none',
    };
  })()`);
  assert(
    commandDialog.modal === 'true' &&
      commandDialog.inputFocused &&
      commandDialog.focusVisible &&
      commandDialog.outlineStyle !== 'none' &&
      commandDialog.outlineWidth !== '0px',
    `${themeLabel(dark)} ${viewport.width}px command dialog semantics or keyboard focus are incomplete: ${JSON.stringify(commandDialog)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} search dialog`, [
    { name: 'command palette input', selector: '[role="dialog"][aria-label="Agency and tool search"] input[aria-label="Search agencies and tools"]' },
  ]);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await waitFor(cdp, `!document.querySelector('[role="dialog"][aria-label="Agency and tool search"]')`, 'search dialog to close with Escape');

  const utilityTriggerSelector = viewport.mobile
    ? 'button[aria-label="Workspace tools"]'
    : 'button[aria-label="Help and sources"]';
  const openedUtilityMenu = await evaluate(cdp, `(() => {
    const trigger = document.querySelector(${JSON.stringify(utilityTriggerSelector)});
    if (!trigger) return false;
    trigger.focus();
    trigger.click();
    return true;
  })()`);
  assert(openedUtilityMenu, `Could not open the ${viewport.mobile ? 'mobile workspace tools' : 'desktop help'} menu`);
  const lineageAction = viewport.mobile
    ? 'Help, data lineage & sources'
    : 'Federal data lineage & sources';
  await clickVisible(cdp, lineageAction, true);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[role="dialog"][aria-labelledby="data-lineage-modal-title"]'))`,
    'field-by-field data lineage dialog',
  );
  await waitFor(
    cdp,
    `document.activeElement?.getAttribute('data-testid') === 'button-acknowledge-data-lineage'`,
    'focused data lineage dialog action',
  );
  const lineageDialog = await evaluate(cdp, `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="data-lineage-modal-title"]');
    const title = document.getElementById('data-lineage-modal-title');
    const rect = dialog?.getBoundingClientRect();
    return {
      modal: dialog?.getAttribute('aria-modal'),
      title: title?.innerText.trim() ?? '',
      focusInside: Boolean(dialog?.contains(document.activeElement)),
      boundsFit: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
      horizontalOverflow: Boolean(dialog && dialog.scrollWidth > dialog.clientWidth),
    };
  })()`);
  assert(
    lineageDialog.modal === 'true' &&
      lineageDialog.title === 'Field-by-field source evidence audit' &&
      lineageDialog.focusInside &&
      lineageDialog.boundsFit,
    `${themeLabel(dark)} ${viewport.width}px data lineage dialog is not clearly named, focused, or contained: ${JSON.stringify(lineageDialog)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} data lineage dialog`, [
    { name: 'data lineage title', selector: '#data-lineage-modal-title' },
  ]);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    cdp,
    `!document.querySelector('[role="dialog"][aria-labelledby="data-lineage-modal-title"]')`,
    'data lineage dialog to close with Escape',
  );
  await waitFor(
    cdp,
    `document.activeElement?.matches(${JSON.stringify(utilityTriggerSelector)})`,
    'data lineage dialog to restore focus to its menu trigger',
  );
  console.log(`  ${themeLabel(dark)} ${viewport.width}px data lineage dialog: accessible name, contained layout, initial focus, and Escape behavior`);

  if (viewport.mobile) {
    const opened = await evaluate(cdp, `(() => {
      const trigger = document.querySelector('[data-testid="button-mobile-provider-search"]');
      if (!trigger) return false;
      trigger.focus();
      trigger.click();
      return true;
    })()`);
    assert(opened, 'Could not open the mobile provider search dialog');
    await waitFor(
      cdp,
      `Boolean(document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]'))`,
      'mobile provider search dialog',
    );
    await waitFor(
      cdp,
      `document.activeElement?.getAttribute('aria-label') === 'Search agency name, city, county, or ZIP code'`,
      'focused mobile provider search',
    );
    const mobileDialog = await evaluate(cdp, `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]');
      const input = dialog?.querySelector('input[aria-label="Search agency name, city, county, or ZIP code"]');
      return {
        modal: dialog?.getAttribute('aria-modal'),
        labelledBy: dialog?.getAttribute('aria-labelledby'),
        title: document.getElementById('mobile-finder-title')?.innerText.trim() ?? '',
        inputFocused: document.activeElement === input,
        inputShadow: input ? getComputedStyle(input).boxShadow : 'none',
      };
    })()`);
    assert(
      mobileDialog.modal === 'true' &&
        mobileDialog.labelledBy === 'mobile-finder-title' &&
        mobileDialog.title &&
        mobileDialog.inputFocused &&
        mobileDialog.inputShadow !== 'none',
      `Mobile provider dialog semantics or focus are incomplete: ${JSON.stringify(mobileDialog)}`,
    );
    await checkReadable(cdp, `${themeLabel(dark)} mobile provider dialog`, [
      { name: 'provider search input', selector: '[role="dialog"][aria-labelledby="mobile-finder-title"] input[aria-label="Search agency name, city, county, or ZIP code"]' },
    ]);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await waitFor(cdp, `!document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]')`, 'mobile search dialog to close with Escape');
    await waitFor(
      cdp,
      `document.activeElement?.getAttribute('data-testid') === 'button-mobile-provider-search'`,
      'mobile provider dialog to restore focus to its trigger',
    );
  }
  console.log(`  ${themeLabel(dark)} ${viewport.width}px live search dialog: accessible name, keyboard focus, Escape behavior${viewport.mobile ? ', mobile focus restoration' : ''}`);
}

async function checkHome(cdp, dark) {
  await setTheme(cdp, dark);
  const shell = await evaluate(cdp, `(() => {
    const desktopNavigation = document.querySelector('.pi-primary-sidebar');
    const mobileNavigation = document.querySelector('.pi-mobile-nav');
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    };
    const currentDesktop = desktopNavigation?.querySelector('[aria-current="page"]');
    const currentMobile = mobileNavigation?.querySelector('[aria-current="page"]');
    const active = innerWidth < 768 ? currentMobile : currentDesktop;
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      desktopVisible: visible(desktopNavigation),
      mobileVisible: visible(mobileNavigation),
      activeLabel: active?.innerText.trim() ?? active?.getAttribute('aria-label') ?? '',
      activeColor: active ? getComputedStyle(active).color : '',
      activeBackground: active ? getComputedStyle(active).backgroundColor : '',
      themeColor: document.querySelector('meta[name="theme-color"]')?.content.trim() ?? '',
      expectedThemeColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--pi-nav-bg').trim(),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      pageVerticalOverflow: document.documentElement.scrollHeight > innerHeight + 1,
      homeBounds: (() => {
        const home = document.querySelector('.home-territory-map-screen-v2');
        if (!home) return null;
        const rect = home.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      })(),
    };
  })()`);
  assert(
    shell.desktopVisible === (shell.viewportWidth >= 768) &&
      shell.mobileVisible === (shell.viewportWidth < 768),
    `${themeLabel(dark)} navigation does not match the ${shell.viewportWidth}px responsive breakpoint: ${JSON.stringify(shell)}`,
  );
  assert(
    /Home|Map/i.test(shell.activeLabel),
    `${themeLabel(dark)} active Home navigation item is missing at ${shell.viewportWidth}px: ${JSON.stringify(shell)}`,
  );
  assert(
    shell.themeColor === shell.expectedThemeColor,
    `${themeLabel(dark)} PWA browser chrome does not match the app theme at ${shell.viewportWidth}px: ${JSON.stringify(shell)}`,
  );
  assert(!shell.pageOverflow, `${themeLabel(dark)} Home causes page-level horizontal overflow at ${shell.viewportWidth}px`);
  if (shell.viewportWidth === 1366) {
    assert(
      !shell.pageVerticalOverflow && shell.homeBounds && shell.homeBounds.top >= -1 &&
        shell.homeBounds.bottom <= shell.viewportHeight + 1,
      `${themeLabel(dark)} 1366×768 Home does not fit without page scrolling: ${JSON.stringify(shell)}`,
    );
  }

  await checkReadable(cdp, `${themeLabel(dark)} ${shell.viewportWidth}px navigation`, [
    {
      name: 'active workspace navigation',
      selector: shell.viewportWidth < 768
        ? '.pi-mobile-nav button[aria-current="page"]'
        : '.pi-primary-sidebar [aria-current="page"]',
      backgroundSelector: shell.viewportWidth < 768
        ? '.pi-mobile-nav'
        : '.pi-primary-sidebar .pi-primary-nav button[aria-current="page"]',
    },
  ]);
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
  await evaluate(cdp, `(() => {
    const selector = innerWidth < 768
      ? '.pi-mobile-nav button[aria-current="page"]'
      : '.pi-primary-sidebar [aria-current="page"]';
    const active = document.querySelector(selector);
    active?.focus();
  })()`);
  const navigationFocus = await evaluate(cdp, `(() => {
    const selector = innerWidth < 768
      ? '.pi-mobile-nav button[aria-current="page"]'
      : '.pi-primary-sidebar [aria-current="page"]';
    const active = document.querySelector(selector);
    const style = active && getComputedStyle(active);
    return {
      focused: document.activeElement === active,
      focusVisible: Boolean(active?.matches(':focus-visible')),
      outlineWidth: style?.outlineWidth ?? '0px',
      outlineStyle: style?.outlineStyle ?? 'none',
      outlineColor: style?.outlineColor ?? '',
    };
  })()`);
  assert(
    navigationFocus.focused &&
      navigationFocus.focusVisible &&
      navigationFocus.outlineWidth !== '0px' &&
      navigationFocus.outlineStyle !== 'none' &&
      navigationFocus.outlineColor !== 'rgba(0, 0, 0, 0)',
    `${themeLabel(dark)} navigation focus ring is missing or not theme-colored at ${shell.viewportWidth}px: ${JSON.stringify(navigationFocus)}`,
  );
  await evaluate(cdp, 'document.activeElement?.blur()');

  const metrics = await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    return metric ? [...metric.options].map((option) => option.value) : [];
  })()`);
  const metricControlEnabled = await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    return Boolean(metric && !metric.disabled);
  })()`);
  assert(metricControlEnabled, `${themeLabel(dark)} Home map metric selector is missing or disabled`);
  const selectedFlorida = await evaluate(cdp, `(() => {
    const state = [...document.querySelectorAll('.home-map-state-path')]
      .find((path) => path.getAttribute('aria-label')?.startsWith('Florida.'));
    state?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return Boolean(state);
  })()`);
  assert(selectedFlorida, `${themeLabel(dark)} Home has no keyboard-activatable Florida map target`);
  await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen'))`, 'state selection opening Territory');
  if (shell.viewportWidth < 768) {
    await clickVisible(cdp, '.pi-mobile-nav button[aria-label="Map"]');
  } else {
    await clickVisible(cdp, 'Map', true);
  }
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path[aria-label^="Florida."][aria-pressed="true"]'))`, 'selected Florida on the returning map');
  let missingLayer = null;
  for (const metricValue of metrics) {
    const selectorState = await evaluate(cdp, `(() => {
      const metric = document.querySelector('[data-testid="select-state-map-metric"]');
      if (!metric || metric.disabled) return null;
      const rect = metric.getBoundingClientRect();
      return {
        value: metric.value,
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        options: [...metric.options].map((option) => ({ value: option.value, label: option.textContent.trim() })),
      };
    })()`);
    assert(selectorState, `${themeLabel(dark)} Home map metric selector is not available for input`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: selectorState.x, y: selectorState.y });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: selectorState.x, y: selectorState.y, button: 'left', clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: selectorState.x, y: selectorState.y, button: 'left', clickCount: 1,
    });
    const previousIndex = metrics.indexOf(selectorState.value);
    const nextIndex = metrics.indexOf(metricValue);
    for (let step = 0; step < Math.abs(nextIndex - previousIndex); step += 1) {
      const key = nextIndex > previousIndex ? 'ArrowDown' : 'ArrowUp';
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="select-state-map-metric"]')?.value === ${JSON.stringify(metricValue)}`,
      `${metricValue} map layer in ${themeLabel(dark)} theme`,
    );
    const metricLabel = selectorState.options.find((option) => option.value === metricValue)?.label ?? '';
    await waitFor(
      cdp,
      `document.querySelector('.home-map-legend-title')?.innerText.includes(${JSON.stringify(metricLabel)})`,
      `${metricValue} selection updating the map legend in ${themeLabel(dark)} theme`,
    );
    const legendExplainsRelativeColors = await evaluate(cdp, `document.querySelector('[data-testid="text-map-legend-coverage"]')?.innerText.includes('relative quintiles') ?? false`);
    assert(legendExplainsRelativeColors, `${themeLabel(dark)} map legend does not explain relative state colors for ${metricValue}`);
    if (metricValue === 'cardiac-survival') {
      const visibleColorBands = await evaluate(cdp, `new Set([...document.querySelectorAll('.home-map-state-path')]
        .map((path) => path.getAttribute('fill'))
        .filter((fill) => fill && !fill.includes('home-map-missing-data'))).size`);
      assert(visibleColorBands >= 4, `${themeLabel(dark)} cardiac survival map has too few distinct state comparison bands: ${visibleColorBands}`);
    }
    const paletteControl = await evaluate(cdp, `Boolean(document.querySelector('[data-testid="select-map-color-palette"]'))`);
    if (paletteControl) {
      const paletteValue = await evaluate(cdp, `(() => {
        const palette = document.querySelector('[data-testid="select-map-color-palette"]');
        if (!palette) return '';
        const next = palette.value === 'standard' ? 'colorblind-safe' : 'standard';
        palette.value = next;
        palette.dispatchEvent(new Event('change', { bubbles: true }));
        return next;
      })()`);
      await waitFor(
        cdp,
        `document.querySelector('.home-map-viewport svg')?.dataset.mapPalette === ${JSON.stringify(paletteValue)}`,
        `${paletteValue} palette selection updating the map in ${themeLabel(dark)} theme`,
      );
    }
    const missingCount = await evaluate(cdp, `(() => [...document.querySelectorAll('.home-map-state-path')]
      .filter((path) => path.getAttribute('fill')?.includes('home-map-missing-data')).length)()`);
    if (missingCount > 0) {
      missingLayer = { metricValue, missingCount };
      break;
    }
  }
  const stateCue = await evaluate(cdp, `(() => {
    const selected = document.querySelector('.home-map-state-path[aria-pressed="true"]');
    const missing = [...document.querySelectorAll('.home-map-state-path')]
      .find((path) => path.getAttribute('fill')?.includes('home-map-missing-data'));
    const missingLegend = document.querySelector('.home-map-legend-missing')?.innerText.trim() ?? '';
    const selectedLabel = selected?.getAttribute('aria-label') ?? '';
    const paths = [...(selected?.parentElement?.querySelectorAll('path') ?? [])];
    return {
      selected: Boolean(selected),
      selectedIsDescribed: selectedLabel.length > 0,
      selectedHasDoubleOutline: paths.some((path) => path.getAttribute('stroke') === '#06101B') &&
        paths.some((path) => path.getAttribute('stroke') === '#F4C86A'),
      missingFill: missing?.getAttribute('fill') ?? '',
      missingLegend,
      missingHasText: missingLegend.includes('Not reported'),
      missingHasPattern: Boolean(document.querySelector('#home-map-missing-data')),
      missingHasHatch: !missing || Boolean(missing.getAttribute('fill')?.includes('home-map-missing-data')),
      regionHasSelection: Boolean(document.querySelector('.home-map-region-filter button[aria-pressed="true"]')),
      controls: Boolean(document.querySelector('[data-testid="select-state-map-metric"]') &&
        document.querySelector('[data-testid="button-map-zoom-in"]')),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert(
    stateCue.selected && stateCue.selectedIsDescribed && stateCue.selectedHasDoubleOutline &&
      stateCue.missingHasText && stateCue.missingHasPattern && stateCue.missingHasHatch &&
      stateCue.regionHasSelection &&
      stateCue.controls &&
      !stateCue.pageOverflow,
    `Home selected/missing/control cues are incomplete in ${themeLabel(dark)} theme: ${JSON.stringify(stateCue)}`,
  );
  const mapSurfaceColors = await evaluate(cdp, `(() => {
    const selectors = {
      mapCard: '.home-map-stage-v2',
      mapCanvas: '.home-map-viewport',
      legendCard: '.home-map-legend',
      stateCard: '.home-map-state-preview',
      metricSelect: '[data-testid="select-state-map-metric"]',
    };
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector);
      return [name, element ? getComputedStyle(element).backgroundColor : 'missing'];
    }));
  })()`);
  assert(
    Object.values(mapSurfaceColors).every((color) => color === 'rgb(255, 255, 255)'),
    `Home map cards and selector should have white backgrounds in ${themeLabel(dark)} theme: ${JSON.stringify(mapSurfaceColors)}`,
  );
  const initialMapZoom = await evaluate(cdp, `document.querySelector('.home-map-viewport')?.dataset.mapZoom ?? ''`);
  await evaluate(cdp, `(() => {
    const map = document.querySelector('.home-map-viewport');
    const bounds = map?.getBoundingClientRect();
    if (!map || !bounds) return false;
    map.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    return true;
  })()`);
  const afterWheelZoom = await evaluate(cdp, `document.querySelector('.home-map-viewport')?.dataset.mapZoom ?? ''`);
  assert(initialMapZoom === afterWheelZoom, `${themeLabel(dark)} Home map zoomed from a mouse wheel`);
  await clickButtonAndScroll(cdp, 'National view');
  await waitFor(
    cdp,
    `!document.querySelector('.home-map-state-path[aria-pressed="true"]') &&
      Boolean([...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'National view')) &&
      document.querySelector('.home-map-page-heading p')?.innerText.includes('Choose a state to review')`,
    'return to the national map',
  );
  if (!missingLayer) {
    console.log(`  ${themeLabel(dark)} Home: no selected map layer currently has unavailable state data; missing fill definition and textual legend are present.`);
  } else {
    console.log(`  ${themeLabel(dark)} Home: ${missingLayer.missingCount} missing states use the hatched fill on ${missingLayer.metricValue}.`);
  }
  await checkReadable(cdp, `${themeLabel(dark)} Home`, [
    { name: 'map metric control', selector: '[data-testid="select-state-map-metric"]' },
    { name: 'selected region label', selector: '.home-map-region-filter button[aria-pressed="true"]' },
    { name: 'map legend heading', selector: '.home-map-legend-title' },
    { name: 'missing-data legend', selector: '.home-map-legend-missing' },
  ]);
}

const workspaceDestinationAudit = {
  reports: [
    'Purchasing timeline',
    'Fire grants',
    'Territory priorities',
    'Clinical & competitive reference',
    'Equipment viewer',
  ],
  settings: [
    'Data status & sync',
    'Backup & restore',
    'Source directory',
    'Public data & imports',
  ],
};

async function clickWorkspaceDestination(cdp, label) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('.workspace-hub .workspace-destination')]
      .find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    button.scrollIntoView({ behavior: 'instant', block: 'center' });
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not open the ${label} destination`);
}

async function checkWorkspaceDestinations(cdp, themeMode, viewport) {
  await setTheme(cdp, themeMode);
  const openHub = async (kind) => {
    if (viewport.mobile) {
      await clickVisible(cdp, `.pi-mobile-nav button[aria-label="${kind === 'reports' ? 'Reports' : 'Settings'}"]`);
    } else {
      await clickVisible(cdp, kind === 'reports' ? 'Reports' : 'Settings', true);
    }
    await waitFor(cdp, `Boolean(document.querySelector('.workspace-hub h1'))`, `${kind} hub`);
    const matches = await evaluate(cdp, `document.querySelector('.workspace-hub h1')?.textContent?.trim() === ${JSON.stringify(kind === 'reports' ? 'Reports' : 'Settings')}`);
    assert(matches, `The ${kind} hub did not open`);
  };
  const inspectPage = async (label) => {
    await waitFor(
      cdp,
      `Boolean(document.querySelector('.workspace-grid-shell')) && !document.querySelector('[data-testid="workspace-loading-state"]')`,
      `${label} screen`,
      30_000,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const layout = await evaluate(cdp, `(() => {
      const root = document.querySelector('.workspace-grid-shell');
      const body = document.body;
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const undersized = [...document.querySelectorAll('.workspace-grid-shell button, .workspace-grid-shell [role="button"], .workspace-grid-shell select, .workspace-grid-shell input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), .workspace-grid-shell summary')]
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { label: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || element.tagName).trim().slice(0, 70), width: Math.round(rect.width), height: Math.round(rect.height) };
        })
        .filter((item) => item.width < 44 || item.height < 44)
        .slice(0, 8);
      return {
        hasRoot: Boolean(root),
        hasPageContent: Boolean(root?.innerText.trim()),
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, body.scrollWidth) > innerWidth + 1,
        undersized,
        errorText: /this view could not load|something went wrong|unable to load this workspace/i.test(root?.innerText ?? ''),
      };
    })()`);
    assert(layout.hasRoot && layout.hasPageContent, `${label} rendered without usable workspace content`);
    assert(!layout.errorText, `${label} displayed an error boundary instead of its screen`);
    assert(!layout.horizontalOverflow, `${label} caused page-level horizontal scrolling at ${viewport.width}px`);
    if (viewport.mobile) {
      assert(layout.undersized.length === 0, `${label} has mobile controls below 44px: ${JSON.stringify(layout.undersized)}`);
    }
    console.log(`  ${themeLabel(themeMode)} ${viewport.width}px ${label}: content visible, no page overflow${viewport.mobile ? ', 44px targets' : ''}`);
  };

  for (const [hubKind, destinations] of Object.entries(workspaceDestinationAudit)) {
    await openHub(hubKind);
    await inspectPage(hubKind === 'reports' ? 'Reports' : 'Settings');
    for (const label of destinations) {
      await clickWorkspaceDestination(cdp, label);
      await inspectPage(label);
      await openHub(hubKind);
    }
  }
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home after screen audit');
}

async function checkCounty(cdp, dark) {
  await setTheme(cdp, dark);
  const summary = await evaluate(cdp, `(() => {
    const panel = document.querySelector('.county-directory-heading');
    const card = document.querySelector('.county-signal-row');
    const title = card?.querySelector('.cb-name');
    const missing = [...(card?.querySelectorAll('*') ?? [])]
      .find((element) => element.children.length === 0 && /not reported/i.test(element.textContent ?? ''));
    return {
      summaryText: panel?.innerText.trim().slice(0, 400) ?? '',
      cardTitle: title?.innerText.trim() ?? '',
      missingLabel: missing?.textContent.trim() ?? '',
      countyCount: document.querySelectorAll('.county-signal-row').length,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      mainOverflow: Boolean(document.querySelector('main') &&
        document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth + 1),
    };
  })()`);
  assert(summary.summaryText.length > 20, `${themeLabel(dark)} county summary is empty`);
  assert(summary.cardTitle, `${themeLabel(dark)} county card title is missing`);
  assert(summary.countyCount > 0, `${themeLabel(dark)} county cards are missing`);
  assert(
    !summary.pageOverflow && !summary.mainOverflow,
    `${themeLabel(dark)} county cards cause horizontal overflow: ${JSON.stringify(summary)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} county`, [
    { name: 'county card title', selector: '.county-signal-row .cb-name' },
    { name: 'county directory heading', selector: '.county-directory-heading h3' },
  ]);
  console.log(
    `  ${themeLabel(dark)} county state: ${summary.countyCount} cards; missing-data label ${summary.missingLabel || 'not present in first card'}`,
  );
  await captureThemeScreenshot(cdp, dark, 'territory');
}

let profileReturnScrollY = 0;

async function openProfile(cdp) {
  if (await evaluate(cdp, 'innerWidth < 768')) {
    const searchOpened = await evaluate(cdp, `(() => {
      const button = document.querySelector('[data-testid="button-mobile-provider-search"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (searchOpened) {
      await waitFor(cdp, `Boolean(document.querySelector('[role="dialog"][aria-labelledby="mobile-finder-title"]'))`, 'mobile provider finder');
      await evaluate(cdp, `document.querySelector('button[aria-label="Close provider search"]')?.click()`);
    }
  }
  await clickVisible(cdp, 'Agencies', true);
  await waitFor(cdp, `document.body.innerText.includes('Open agency profile')`, 'agency directory');
  const initializedFilters = await evaluate(cdp, `(() => {
    const toggle = document.querySelector('[data-testid="agency-secondary-filters-toggle"]');
    if (innerWidth < 640 && toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
    const ems = [...(document.querySelector('[aria-label="Provider Discipline Filter"]')?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.trim().startsWith('EMS'));
    ems?.click();
    const input = document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (input && setter) {
      setter.call(input, 'EMS');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return Boolean(input && ems);
  })()`);
  assert(initializedFilters, 'Could not apply an EMS directory search and discipline filter');
  await waitFor(
    cdp,
    `document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]')?.value === 'EMS' &&
      Boolean(document.querySelector('[aria-label="Provider Discipline Filter"] button[aria-pressed="true"]'))`,
    'the EMS search and discipline filter',
  );
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((candidate) => candidate.innerText.trim().startsWith('Open agency profile'));
    if (!button) return { clicked: false, scrollY: 0 };
    button.scrollIntoView({ behavior: 'instant', block: 'center' });
    window.scrollTo({ top: Math.max(0, window.scrollY), behavior: 'instant' });
    const scrollY = window.scrollY;
    button.click();
    return { clicked: true, scrollY };
  })()`);
  assert(clicked.clicked, 'Could not open a provider profile');
  profileReturnScrollY = clicked.scrollY;
  await waitFor(cdp, `Boolean(document.querySelector('main.profile-workspace'))`, 'provider profile');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('main.profile-workspace [data-testid="text-agency-name"]')?.innerText.trim()) &&
      Boolean(document.querySelector('main.profile-workspace [data-testid="button-profile-inspect-sources"]'))`,
    'provider identity and source inspection action',
  );
}

async function checkProfileBackRestoration(cdp, viewport) {
  const clicked = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="profile-back-button"]');
    button?.click();
    return Boolean(button);
  })()`);
  assert(clicked, 'Could not return from the provider profile');
  await waitFor(
    cdp,
    `!document.querySelector('main.profile-workspace') &&
      Boolean(document.querySelector('[data-testid="workspace-lead-queue"]')) &&
      document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]')?.value === 'EMS' &&
      document.querySelector('[aria-label="Provider Discipline Filter"] button[aria-pressed="true"]')?.innerText.trim().startsWith('EMS')`,
    'agency directory query and filters after profile return',
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const restored = await evaluate(cdp, `(() => ({
    scrollY: window.scrollY,
    geography: document.querySelector('.pi-sb-geo')?.innerText.trim() ?? '',
    query: document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]')?.value ?? '',
    activeDiscipline: document.querySelector('[aria-label="Provider Discipline Filter"] button[aria-pressed="true"]')?.innerText.trim() ?? '',
  }))()`);
  assert(restored.query === 'EMS' && restored.activeDiscipline.startsWith('EMS'), `Agency search filters were not restored after Back: ${JSON.stringify(restored)}`);
  assert(/FL|Florida/i.test(restored.geography), `The Florida geographic context was not restored after Back: ${JSON.stringify(restored)}`);
  const scrollTolerance = Math.max(40, Math.round(viewport.height * 0.05));
  assert(
    Math.abs(restored.scrollY - profileReturnScrollY) <= scrollTolerance,
    `Directory scroll position was not restored at ${viewport.width}px: ${JSON.stringify({ restored, expected: profileReturnScrollY })}`,
  );
  console.log(`  ${viewport.width}px profile Back restores EMS search/filter, Florida scope, and scroll position ${restored.scrollY}px`);
}

async function checkAgencyEmptyRecovery(cdp) {
  const query = 'zz-no-agency-match-2026';
  await evaluate(cdp, `(() => {
    const input = document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!input || !setter) return false;
    setter.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="agency-directory-empty"]'))`, 'genuine empty agency search result');
  const result = await evaluate(cdp, `(() => {
    const empty = document.querySelector('[data-testid="agency-directory-empty"]');
    return {
      message: empty?.innerText ?? '',
      clearSearch: [...(empty?.querySelectorAll('button') ?? [])].some((button) => button.innerText.trim() === 'Clear search'),
      broaden: [...(empty?.querySelectorAll('button') ?? [])].some((button) => button.innerText.trim() === 'Search all agencies'),
    };
  })()`);
  assert(result.message.includes(query) && result.clearSearch && result.broaden, `Empty search did not explain the query and offer recovery: ${JSON.stringify(result)}`);
  await evaluate(cdp, `(() => [...document.querySelectorAll('[data-testid="agency-directory-empty"] button')].find((button) => button.innerText.trim() === 'Search all agencies')?.click())()`);
  await waitFor(
    cdp,
    `sessionStorage.getItem('queue-selectedState') === '"all"' &&
      sessionStorage.getItem('queue-selectedCategory') === '"all"' &&
      Boolean(document.querySelector('[data-testid="agency-directory-empty"]'))`,
    'broadened search across agency records',
  );
  await evaluate(cdp, `(() => [...document.querySelectorAll('[data-testid="agency-directory-empty"] button')].find((button) => button.innerText.trim() === 'Clear search')?.click())()`);
  await waitFor(cdp, `!document.querySelector('[data-testid="agency-directory-empty"]')`, 'cleared agency search');
  const count = Number.parseInt(await evaluate(cdp, `document.querySelector('[data-testid="text-agency-summary-count"]')?.textContent?.replace(/,/g, '') ?? '0'`), 10);
  assert(count > 0, `Clearing the query did not recover agency results: ${count}`);
  console.log(`  Agency search: query-specific empty state, broaden-to-all and clear-search recovery verified (${count} results)`);
}

async function createStandaloneTask(cdp, action, dueDate) {
  const form = await evaluate(cdp, `(() => {
    const details = document.querySelector('details.followup-create');
    if (!details) return null;
    if (!details.open) details.querySelector('summary')?.click();
    const form = details.querySelector('form');
    const agency = form?.querySelector('select');
    const actionInput = [...(form?.querySelectorAll('input') ?? [])].find((input) => input.type === 'text');
    const priority = [...(form?.querySelectorAll('select') ?? [])].find((select) => select !== agency);
    const date = [...(form?.querySelectorAll('input') ?? [])].find((input) => input.type === 'date');
    const setterFor = (element) => Object.getOwnPropertyDescriptor(
      element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    )?.set;
    if (!form || !agency?.options[1] || !actionInput) return null;
    const set = (element, value) => {
      const setter = setterFor(element);
      setter?.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (element instanceof HTMLInputElement && element.type === 'date') element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (!agency.value) set(agency, agency.options[1].value);
    set(actionInput, ${JSON.stringify(action)});
    if (priority) set(priority, 'high');
    if (date) set(date, ${JSON.stringify(dueDate)});
    return { agencyName: agency.selectedOptions[0]?.textContent?.trim() ?? '', ready: Boolean(form.querySelector('button')) };
  })()`);
  assert(form?.agencyName, `Could not select an agency for task ${action}`);
  const submitted = await evaluate(cdp, `(() => {
    const form = document.querySelector('details.followup-create form');
    const submit = [...(form?.querySelectorAll('button') ?? [])].find((button) => button.innerText.trim() === 'Save task');
    if (!submit || submit.disabled) return false;
    submit.click();
    return true;
  })()`);
  assert(submitted, `Could not save standalone task ${action}`);
  await waitFor(cdp, `Boolean([...document.querySelectorAll('.followup-row h3')].find((heading) => heading.innerText.trim() === ${JSON.stringify(action)}))`, `standalone task ${action}`);
  return form.agencyName;
}

async function checkTaskWorkflow(cdp, viewport) {
  await setTheme(cdp, 'daylight');
  await openProfile(cdp);
  await evaluate(cdp, `document.querySelector('[data-testid="profile-back-button"]')?.click()`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="workspace-lead-queue"]'))`, 'agency directory after profile preloading');
  if (viewport.mobile) await clickVisible(cdp, '.pi-mobile-nav button[aria-label="Field Work"]');
  else {
    const clicked = await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('.pi-primary-nav button')]
        .find((candidate) => candidate.innerText.includes('Field Work'));
      button?.click();
      return Boolean(button);
    })()`);
    assert(clicked, 'Could not open Field Work from desktop navigation');
  }
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Follow-up workspace"] details.followup-create'))`, 'Field Work follow-up creation');
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const firstAction = 'Isolated offline follow-up check';
  const agencyName = await createStandaloneTask(cdp, firstAction, '2026-12-15');
  const initialRow = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === ${JSON.stringify(firstAction)});
    return { text: row?.innerText ?? '', action: row?.querySelector('input')?.value ?? '', outbox: JSON.parse(localStorage.getItem('zoll_pulseiq_outbox_v1') || '[]'), online: navigator.onLine };
  })()`);
  assert(!initialRow.online && initialRow.action === firstAction && initialRow.text.includes('Unassigned') && initialRow.text.includes('high priority'), `Offline task was not saved with explicit unassigned ownership and priority: ${JSON.stringify(initialRow)}`);
  assert(initialRow.outbox.some((item) => item.actionType === 'CREATE_FOLLOW_UP' && item.status === 'PENDING'), 'Offline task was not retained in the recovery outbox');

  const rowUpdated = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === ${JSON.stringify(firstAction)});
    const labels = [...(row?.querySelectorAll('label') ?? [])];
    const action = labels.find((label) => label.innerText.trim().startsWith('Action'))?.querySelector('input');
    const owner = labels.find((label) => label.innerText.trim().startsWith('Owner'))?.querySelector('input');
    const priority = labels.find((label) => label.innerText.trim().startsWith('Priority'))?.querySelector('select');
    const date = labels.find((label) => label.innerText.trim().startsWith('Follow-up date'))?.querySelector('input');
    const set = (element, value) => {
      const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (element instanceof HTMLInputElement && element.type === 'date') element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (!row || !action || !priority || !date) return false;
    set(action, 'Confirm recorded equipment lifecycle');
    if (owner) set(owner, '');
    set(priority, 'normal');
    set(date, '2026-12-22');
    [...row.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Save changes')?.click();
    return true;
  })()`);
  assert(rowUpdated, 'Could not edit the standalone action, owner, priority, and date');
  await waitFor(cdp, `Boolean([...document.querySelectorAll('.followup-row h3')].find((heading) => heading.innerText.trim() === 'Confirm recorded equipment lifecycle'))`, 'saved follow-up edits');
  const historyOpened = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === 'Confirm recorded equipment lifecycle');
    const history = row?.querySelector('details.followup-history');
    if (!history) return false;
    history.querySelector('summary')?.click();
    return history.innerText.includes('Task created') && history.innerText.includes('Updated') &&
      history.innerText.includes('Isolated offline follow-up check') && history.innerText.includes('Confirm recorded equipment lifecycle') &&
      (history.innerText.match(/2026/g) ?? []).length >= 2;
  })()`);
  assert(historyOpened, 'Follow-up history did not retain creation and before/after values with timestamps');

  const completed = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === 'Confirm recorded equipment lifecycle');
    const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.innerText.trim() === 'Complete');
    button?.click();
    return Boolean(button);
  })()`);
  assert(completed, 'Could not complete the follow-up');
  const completedFilter = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('.followup-filters button')].find((candidate) => candidate.innerText.trim().startsWith('Completed'));
    button?.click();
    return Boolean(button);
  })()`);
  assert(completedFilter, 'Could not filter to completed follow-ups');
  await waitFor(cdp, `Boolean([...document.querySelectorAll('.followup-row h3')].find((heading) => heading.innerText.trim() === 'Confirm recorded equipment lifecycle'))`, 'completed follow-up');
  const reopened = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === 'Confirm recorded equipment lifecycle');
    const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.innerText.trim() === 'Reopen');
    button?.click();
    return Boolean(button);
  })()`);
  assert(reopened, 'Could not reopen the completed follow-up');
  await evaluate(cdp, `(() => [...document.querySelectorAll('.followup-filters button')].find((button) => button.innerText.trim().startsWith('All open'))?.click())()`);
  await waitFor(cdp, `Boolean([...document.querySelectorAll('.followup-row h3')].find((heading) => heading.innerText.trim() === 'Confirm recorded equipment lifecycle'))`, 'reopened follow-up');

  const openedAgency = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.followup-row')].find((item) => item.querySelector('h3')?.innerText.trim() === 'Confirm recorded equipment lifecycle');
    const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.innerText.trim() === ${JSON.stringify(agencyName)});
    button?.click();
    return Boolean(button);
  })()`);
  assert(openedAgency, 'Could not open the task-linked agency profile');
  await waitFor(cdp, `Boolean(document.querySelector('main.profile-workspace'))`, 'task-linked profile');
  if (viewport.mobile) {
    const openedActivity = await evaluate(cdp, `(() => {
      const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
      if (!select) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'activity');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(openedActivity, 'Could not open Activity on the profile phone layout');
  } else {
    await clickVisible(cdp, 'Activity', true);
  }
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Agency action center"] details.followup-create'))`, 'agency Activity task creation');
  const activityTask = 'Isolated agency activity task check';
  const lastInteractionBefore = await evaluate(cdp, `document.querySelector('[aria-label="Agency action center"] .followup-account-summary')?.querySelector('p')?.innerText ?? ''`);
  const activityAgency = await createStandaloneTask(cdp, activityTask, '');
  assert(activityAgency === agencyName, 'The Activity task was not linked to the open agency');
  const activitySummary = await evaluate(cdp, `(() => ({
    lastInteraction: document.querySelector('[aria-label="Agency action center"] .followup-account-summary')?.querySelector('p')?.innerText ?? '',
    hasTask: [...document.querySelectorAll('.followup-row h3')].some((heading) => heading.innerText.trim() === ${JSON.stringify(activityTask)}),
    standaloneLabel: [...document.querySelectorAll('.followup-row')].find((row) => row.querySelector('h3')?.innerText.trim() === ${JSON.stringify(activityTask)})?.innerText.includes('Standalone task') ?? false,
  }))()`);
  assert(activitySummary.hasTask && activitySummary.standaloneLabel, 'Activity did not show the standalone task');
  assert(activitySummary.lastInteraction === lastInteractionBefore, 'Creating a follow-up changed the last interaction date');
  console.log(`  ${viewport.width}px offline follow-up: Field Work and Activity creation, edits/history, complete/reopen, recovery queue, and contact-date preservation`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

async function checkProfileAndSources(cdp, dark) {
  await setTheme(cdp, dark);
  await evaluate(cdp, `(() => { const details = document.querySelector('.profile-more-actions'); if (details) details.open = true; })()`);
  await evaluate(cdp, `(() => { const details = document.querySelector('[data-testid="profile-record-context"]'); if (details) details.open = true; })()`);
  const profileCues = await evaluate(cdp, `(() => {
    const status = document.querySelector('[data-testid="text-profile-freshness"]');
    const source = document.querySelector('[data-testid="button-profile-inspect-sources"]');
    const profile = document.querySelector('main.profile-workspace');
    const profileRect = profile?.getBoundingClientRect();
    return {
      agencyName: document.querySelector('[data-testid="text-agency-name"]')?.innerText.trim() ?? '',
      statusText: status?.innerText.trim() ?? '',
      statusHasAccessibleState: Boolean(status),
      sourcePanel: Boolean(document.querySelector('[data-testid="text-profile-source-period"]')),
      sourceAction: Boolean(source && source.getAttribute('aria-label') === 'Inspect agency sources'),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      profileOverflow: Boolean(profile && profile.scrollWidth > profile.clientWidth + 1),
      profileBounds: profile ? { left: profileRect.left, right: profileRect.right, width: profile.clientWidth, scrollWidth: profile.scrollWidth } : null,
      overflowingChildren: profile ? [...profile.querySelectorAll('*')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > profileRect.right + 2 || rect.left < profileRect.left - 2);
      }).slice(0, 8).map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        text: element.textContent?.trim().slice(0, 80) ?? '',
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      })) : [],
    };
  })()`);
  assert(profileCues.statusText, `${themeLabel(dark)} profile status is missing`);
  assert(profileCues.statusHasAccessibleState, 'Profile review status is missing its labelled control');
  assert(profileCues.agencyName, 'Provider profile is missing its agency identity');
  assert(profileCues.sourcePanel, 'Provider source-period context is missing');
  assert(profileCues.sourceAction, 'Agency source inspection action is missing or not labelled');
  assert(
    !profileCues.pageOverflow && !profileCues.profileOverflow,
    `${themeLabel(dark)} provider profile causes horizontal overflow: ${JSON.stringify(profileCues)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} provider profile`, [
    { name: 'profile agency identity', selector: '[data-testid="text-agency-name"]' },
    { name: 'profile source period', selector: '[data-testid="text-profile-source-period"]' },
    { name: 'source inspection action', selector: '[data-testid="button-profile-inspect-sources"]' },
  ]);

  const opened = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="profile-primary-actions"] [aria-label="Inspect agency sources"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(opened, 'Could not open provider source panel');
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]'))`, 'provider source drawer');
  const sourceCues = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const status = [...(drawer?.querySelectorAll('div, span, p') ?? [])]
      .find((element) => element.children.length === 0 && /NPPES record linked by user/i.test(element.textContent ?? ''));
    return {
      heading: drawer?.querySelector('h3')?.innerText.trim() ?? '',
      statusText: status?.innerText.trim() ?? '',
      body: drawer?.innerText.trim() ?? '',
    };
  })()`);
  assert(sourceCues.heading && sourceCues.body.length > 100, 'Provider source drawer has incomplete content');
  assert(sourceCues.statusText, 'Provider source match status is not expressed in text');
  await checkReadable(cdp, `${themeLabel(dark)} source panel`, [
    { name: 'source drawer title', selector: '[aria-label="Evidence and Source Inspection Drawer"] h3' },
    { name: 'source match status', selector: '[aria-label="Evidence and Source Inspection Drawer"] .text-emerald-800' },
    { name: 'source explanation', selector: '[aria-label="Evidence and Source Inspection Drawer"] .text-emerald-900\\/80' },
  ]);
  console.log(`  ${themeLabel(dark)} profile status: ${profileCues.statusText}; source status: ${sourceCues.statusText}`);
  await captureThemeScreenshot(cdp, dark, 'agency-profile');
  await evaluate(cdp, `document.querySelector('[aria-label="Evidence and Source Inspection Drawer"] button')?.click()`);
  const openedEvidenceSection = await evaluate(cdp, `(() => {
    const mobileSelect = document.querySelector('[data-testid="select-profile-section-mobile"]');
    if (mobileSelect) {
      mobileSelect.value = 'evidence';
      mobileSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return mobileSelect.value === 'evidence';
    }
    const evidenceTab = [...document.querySelectorAll('[data-testid="profile-topic-navigation"] button')]
      .find((button) => button.innerText.trim().startsWith('7. Evidence'));
    evidenceTab?.click();
    return Boolean(evidenceTab);
  })()`);
  assert(openedEvidenceSection, 'Could not open the agency evidence and notes section');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="button-toggle-agency-source-fact-form"]'))`,
    'source fact form action in the evidence section',
  );

  await clickButtonAndScroll(cdp, 'Add fact');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-fact"]'))`,
    'agency source fact form',
  );
  const formState = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-fact"]');
    const labels = [...(form?.querySelectorAll('label') ?? [])];
    return {
      formPresent: Boolean(form),
      labelCount: labels.length,
      labelsHaveControls: labels.every((label) => Boolean(label.control)),
      labelsMeetReadableSize: labels.every((label) => Number.parseFloat(getComputedStyle(label.querySelector('span')).fontSize) >= 11),
      warningCountBeforeSubmit: form?.querySelectorAll('[role="alert"]').length ?? 0,
    };
  })()`);
  assert(
    formState.formPresent &&
      formState.labelCount >= 8 &&
      formState.labelsHaveControls &&
      formState.labelsMeetReadableSize &&
      formState.warningCountBeforeSubmit === 0,
    `${themeLabel(dark)} source form labels or initial warning state are unclear: ${JSON.stringify(formState)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} source form`, [
    { name: 'source form label', selector: '[data-testid="form-add-agency-source-fact"] label > span' },
  ]);
  await evaluate(cdp, `document.querySelector('[data-testid="form-add-agency-source-fact"]')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-fact"] [role="alert"]'))`,
    'actionable source form validation message',
  );
  const warning = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-fact"]');
    const alerts = [...(form?.querySelectorAll('[role="alert"]') ?? [])];
    const text = alerts[0]?.innerText.trim() ?? '';
    return {
      count: alerts.length,
      text,
      valueGuidance: text.includes('reported value'),
      sourceGuidance: text.includes('source name') && text.includes('source record ID'),
      geographyGuidance: text.includes('geography ID') && text.includes('relationship'),
      repeatedCopy: text.length > 0 && (form?.innerText.split(text).length ?? 0) > 2,
    };
  })()`);
  assert(
    warning.count === 1 &&
      warning.valueGuidance &&
      warning.sourceGuidance &&
      warning.geographyGuidance &&
      !warning.repeatedCopy,
    `${themeLabel(dark)} source form warning is missing, repeated, or not actionable: ${JSON.stringify(warning)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} source form validation`, [
    { name: 'source form alert', selector: '[data-testid="form-add-agency-source-fact"] [role="alert"]' },
  ]);
  await clickButtonAndScroll(cdp, 'Close form');
  await waitFor(
    cdp,
    `!document.querySelector('[data-testid="form-add-agency-source-fact"]')`,
    'agency source fact form to close without saving',
  );
  console.log(`  ${themeLabel(dark)} source form: labelled fields and one actionable, readable validation alert`);

  await clickButtonAndScroll(cdp, 'Add correction');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-correction"]'))`,
    'agency source correction form',
  );
  const correctionForm = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    const labels = [...(form?.querySelectorAll('label') ?? [])];
    return {
      labelCount: labels.length,
      labelsHaveControls: labels.every((label) => Boolean(label.control)),
      labelsMeetReadableSize: labels.every((label) => Number.parseFloat(getComputedStyle(label.querySelector('span')).fontSize) >= 11),
    };
  })()`);
  assert(
    correctionForm.labelCount >= 10 &&
      correctionForm.labelsHaveControls &&
      correctionForm.labelsMeetReadableSize,
    `${themeLabel(dark)} correction form labels are incomplete or hard to read: ${JSON.stringify(correctionForm)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} correction form`, [
    { name: 'correction form label', selector: '[data-testid="form-add-agency-source-correction"] label > span' },
  ]);
  await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    const values = new Map([
      ['Profile fact being corrected', 'Annual call volume'],
      ['Previous value', 'Not reported'],
      ['Reported value', '24000'],
      ['Source name', 'Agency annual report'],
      ['Source record ID or citation', 'Page 4'],
    ]);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    for (const [labelText, value] of values) {
      const label = [...(form?.querySelectorAll('label') ?? [])]
        .find((candidate) => candidate.innerText.trim().startsWith(labelText));
      const input = label?.querySelector('input');
      if (!input || !setter) continue;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="form-add-agency-source-correction"] [role="alert"]'))`,
    'actionable correction-period validation message',
  );
  const correctionWarning = await evaluate(cdp, `(() => {
    const form = document.querySelector('[data-testid="form-add-agency-source-correction"]');
    const alerts = [...(form?.querySelectorAll('[role="alert"]') ?? [])];
    return {
      count: alerts.length,
      text: alerts[0]?.innerText.trim() ?? '',
      role: alerts[0]?.getAttribute('role'),
      repeated: alerts.length > 0 && (form?.innerText.split(alerts[0].innerText.trim()).length ?? 0) > 2,
    };
  })()`);
  assert(
    correctionWarning.count === 1 &&
      correctionWarning.role === 'alert' &&
      correctionWarning.text.includes('reporting or effective period') &&
      !correctionWarning.repeated,
    `${themeLabel(dark)} correction warning is missing, repeated, or not actionable: ${JSON.stringify(correctionWarning)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} correction validation`, [
    { name: 'correction form alert', selector: '[data-testid="form-add-agency-source-correction"] [role="alert"]' },
  ]);
  await clickButtonAndScroll(cdp, 'Close form');
  await waitFor(
    cdp,
    `!document.querySelector('[data-testid="form-add-agency-source-correction"]')`,
    'agency correction form to close without saving',
  );
  console.log(`  ${themeLabel(dark)} correction form: labelled fields and one actionable, readable validation alert`);
}

async function openAgencyComparison(cdp) {
  // The preceding profile test deliberately leaves its restored search and
  // geographic context in session storage. Start this independent comparison
  // check from an unfiltered directory without clearing local source records.
  await evaluate(cdp, `sessionStorage.clear()`);
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before agency comparison');
  await clickVisible(cdp, 'Agencies', true);
  await waitFor(
    cdp,
    `Boolean([...document.querySelectorAll('button[data-testid^="button-toggle-comparison-"]')]
      .find((button) => {
        const rect = button.getBoundingClientRect();
        return !button.disabled && rect.width > 0 && rect.height > 0;
      }))`,
    'agency comparison controls',
  );

  const selectedIds = await evaluate(cdp, `(() => [...document.querySelectorAll('button[data-testid^="button-toggle-comparison-"]')]
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return !button.disabled && rect.width > 0 && rect.height > 0 &&
        getComputedStyle(button).visibility !== 'hidden' && button.getAttribute('aria-pressed') !== 'true';
    })
    .slice(0, 3)
    .map((button) => button.dataset.testid.replace('button-toggle-comparison-', '')))()`);
  assert(selectedIds.length === 3, `Expected three visible agency comparison choices, received ${JSON.stringify(selectedIds)}`);
  console.log(`  Agency comparison candidates: ${selectedIds.join(', ')}`);

  const sourceAgencyId = selectedIds[0];
  await evaluate(cdp, `(() => {
    const storageKey = 'ems_territory_agency_source_records_v1';
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const agencyId = ${JSON.stringify(sourceAgencyId)};
    const sourceFacts = saved[agencyId]?.sourceFacts ?? [];
    saved[agencyId] = {
      sourceRecordAssociations: saved[agencyId]?.sourceRecordAssociations ?? [],
      sourceFacts: [
        ...sourceFacts.filter((fact) => fact.id !== 'theme-readability-source-note'),
        {
          id: 'theme-readability-source-note',
          fieldKey: 'providerAddress',
          value: 'Source-listed address',
          sourceName: 'Theme readability test source',
          sourceRecordId: 'theme-readability-record',
          sourceUrl: 'https://example.org/theme-readability-record',
          reportingPeriod: '2025 source record',
          geographicLevel: 'agency',
          geographicId: agencyId,
          basis: 'source-reported',
          note: 'Source note added by the isolated browser readability check.',
          enteredAt: '2026-11-06T00:00:00.000Z',
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  })()`);

  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before agency comparison');
  await clickVisible(cdp, 'Agencies', true);
  await waitFor(
    cdp,
    `Boolean([...document.querySelectorAll('button[data-testid^="button-toggle-comparison-"]')]
      .find((button) => {
        const rect = button.getBoundingClientRect();
        return !button.disabled && rect.width > 0 && rect.height > 0;
      }))`,
    'agency comparison controls after reloading source evidence',
  );
  for (const [index, agencyId] of selectedIds.entries()) {
    const selection = await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('button[data-testid^="button-toggle-comparison-"]')]
        .find((candidate) => candidate.dataset.testid === ${JSON.stringify(`button-toggle-comparison-${agencyId}`)});
      if (!button) return { ok: false, reason: 'missing from current results' };
      if (button.disabled) return { ok: false, reason: 'disabled', pressed: button.getAttribute('aria-pressed') };
      if (button.getAttribute('aria-pressed') === 'true') return { ok: false, reason: 'already selected' };
      button.click();
      return { ok: true, pressed: button.getAttribute('aria-pressed'), disabled: button.disabled };
    })()`);
    assert(selection.ok, `Could not select agency ${agencyId} for comparison: ${JSON.stringify(selection)}`);
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="button-toggle-comparison-${agencyId}"]')?.getAttribute('aria-pressed') === 'true'`,
      `agency ${agencyId} selected for comparison`,
    );
    if (index === 0) {
      const disabledState = await evaluate(cdp, `(() => {
        const button = document.querySelector('[data-testid="button-open-agency-comparison"]');
        return {
          present: Boolean(button),
          disabled: Boolean(button?.disabled),
          ariaDisabled: button?.getAttribute('aria-disabled'),
          panelClosed: !document.querySelector('[data-testid="agency-comparison-panel"]'),
        };
      })()`);
      assert(
        disabledState.present &&
          disabledState.disabled &&
          disabledState.ariaDisabled !== 'false' &&
          disabledState.panelClosed,
        `Compare action should remain disabled until two agencies are selected: ${JSON.stringify(disabledState)}`,
      );
      console.log('  agency comparison: the real Compare action stays disabled until a second agency is selected');
    }
    if (index === 1) {
      const enabled = await evaluate(cdp, `document.querySelector('[data-testid="button-open-agency-comparison"]')?.disabled === false`);
      assert(enabled, 'Compare action did not enable after selecting a second agency');
    }
  }
  await clickVisible(cdp, '[data-testid="button-open-agency-comparison"]');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="agency-comparison-panel"]'))`, 'agency comparison panel');
  return selectedIds;
}

async function openFieldWork(cdp) {
  if (await evaluate(cdp, 'innerWidth < 768')) {
    await clickVisible(cdp, '.pi-mobile-nav button[aria-label="Field Work"]');
    await waitFor(cdp, `Boolean(document.querySelector('.workspace-section-grid h2'))`, 'Field Work workspace');
    return;
  }
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('.pi-primary-nav .pi-sb-item')].find((candidate) => {
      const label = candidate.querySelector('.pi-sb-label')?.textContent?.trim().toLowerCase();
      const rect = candidate.getBoundingClientRect();
      return label === 'field work' && rect.width > 0 && rect.height > 0 &&
        getComputedStyle(candidate).visibility !== 'hidden';
    });
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Could not open Field Work');
  await waitFor(cdp, `Boolean(document.querySelector('.workspace-section-grid h2'))`, 'Field Work workspace');
}

async function checkFieldWork(cdp, dark, viewport) {
  await setTheme(cdp, dark);
  const state = await evaluate(cdp, `(() => ({
    title: document.querySelector('.workspace-section-grid h2')?.innerText.trim() ?? '',
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))()`);
  assert(state.title, 'Field Work heading is missing');
  assert(!state.overflow, `Field Work overflows at ${viewport.width}px`);
  await checkReadable(cdp, `${themeLabel(dark)} Field Work`, [
    { name: 'field work heading', selector: '.workspace-section-grid h2' },
    { name: 'field work supporting text', selector: '.workspace-section-grid p' },
  ]);
  await captureThemeScreenshot(cdp, dark, 'field-work');
}

async function checkAgencyComparison(cdp, dark, selectedIds) {
  await setTheme(cdp, dark);
  const cues = await evaluate(cdp, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const ranks = [...document.querySelectorAll('[data-testid^="comparison-agency-rank-"]')]
      .filter(visible)
      .map((element) => element.innerText.trim());
    const reported = [...document.querySelectorAll('[data-value-status="reported"]')].some(visible);
    const unavailable = [...document.querySelectorAll('[data-value-status="unavailable"]')].some(visible);
    const sourceNote = [...document.querySelectorAll('[data-testid^="source-fact-"]')]
      .filter(visible)
      .find((element) => element.innerText.includes('Source note added by the isolated browser readability check.'));
    const sourceText = sourceNote?.innerText ?? '';
    const panel = document.querySelector('[data-testid="agency-comparison-panel"]');
    return {
      ranks,
      reported,
      unavailable,
      sourceText,
      selectedNames: [...document.querySelectorAll('[data-testid^="button-open-profile-"]')]
        .filter(visible)
        .map((button) => button.innerText.trim()),
      panelPresent: Boolean(panel),
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert(cues.panelPresent, 'Agency comparison panel is missing');
  assert(
    cues.ranks.length === selectedIds.length &&
      cues.ranks.includes('Agency 1') &&
      cues.ranks.includes('Agency 2') &&
      cues.ranks.includes('Agency 3'),
    `${themeLabel(dark)} comparison selected-agency labels are missing or indistinguishable: ${JSON.stringify(cues.ranks)}`,
  );
  assert(cues.selectedNames.length === selectedIds.length, 'Selected agency names are missing from the comparison');
  assert(cues.reported, 'Agency comparison has no reported value to check');
  assert(cues.unavailable, 'Agency comparison has no unavailable field to check');
  assert(
    cues.sourceText.includes('Theme readability test source') &&
      cues.sourceText.includes('2025 source record') &&
      cues.sourceText.includes('Source note added by the isolated browser readability check.'),
    `Agency comparison source note is incomplete: ${JSON.stringify(cues.sourceText)}`,
  );
  assert(!cues.documentOverflow, 'Agency comparison causes page-level horizontal overflow');

  await checkReadable(cdp, `${themeLabel(dark)} agency comparison`, [
    { name: 'selected agency label', selector: '[data-testid^="comparison-agency-rank-"]' },
    { name: 'selected agency name', selector: '[data-testid^="button-open-profile-"] .font-display' },
    { name: 'reported comparison value', selector: '[data-value-status="reported"]' },
    { name: 'unavailable comparison value', selector: '[data-value-status="unavailable"]' },
    { name: 'source evidence note', selector: '[data-testid^="source-fact-"] p:last-child' },
  ]);
  console.log(
    `  ${themeLabel(dark)} agency comparison: ${cues.ranks.join(', ')}; ${cues.selectedNames.map((name) => name.split('\n')[0]).join(' vs ')}; reported, unavailable, and source-note values present`,
  );
  await captureThemeScreenshot(cdp, dark, 'agency-comparison');
  if (dark === 'miami-vice') {
    await clickVisible(cdp, '[data-testid="button-close-comparison"]');
    await waitFor(cdp, `!document.querySelector('[data-testid="agency-comparison-panel"]')`, 'agency comparison panel close');
  }
}

async function openPulseIqCharts(cdp) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before specialty chart checks');
  if (await evaluate(cdp, 'innerWidth < 768')) {
    await clickVisible(cdp, '.pi-mobile-nav button[aria-label="Reports"]');
  } else {
    await clickVisible(cdp, 'Reports', true);
  }
  await waitFor(cdp, `Boolean(document.querySelector('#workspace-hub-title')?.innerText.includes('Reports'))`, 'Reports workspace');
  const openedPriorities = await evaluate(cdp, `(() => {
    const card = [...document.querySelectorAll('.workspace-destination')]
      .find((button) => button.querySelector('strong')?.textContent?.trim() === 'Territory priorities');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  assert(openedPriorities, 'Could not open Territory priorities from Reports');
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Opportunities views"]'))`, 'Territory priority views');
  await clickVisible(cdp, 'Regional priority', true);
  await waitFor(cdp, `Boolean(document.querySelector('h1')?.innerText.includes('Regional Priority Score Breakdown'))`, 'PulseIQ regional chart');
  await waitFor(cdp, `Boolean(document.querySelector('svg.recharts-surface'))`, 'PulseIQ chart SVG');
}

const pulseIqChartModes = [
  {
    label: 'Factor Breakdown',
    name: 'factor breakdown',
    legend: [
      ['Clinical acuity (weighted points)', '#1E3A8A'],
      ['Fleet pressure (weighted points)', '#2563EB'],
      ['Software whitespace (weighted points)', '#60A5FA'],
      ['Grant readiness (weighted points)', '#059669'],
    ],
    polar: false,
    tooltip: true,
  },
  {
    label: 'Benchmark Bars',
    name: 'benchmark bars',
    legend: [
      ['PulseIQ Score (Average / Account)', '#1E3A8A'],
      ['Top Account Score in Region', '#059669'],
    ],
    polar: false,
  },
  {
    label: 'Radar Profile',
    name: 'radar profile',
    legend: [
      ['Current Region Score Profile', '#1E3A8A'],
      ['National Clinical Baseline', '#64748B'],
    ],
    polar: true,
  },
  {
    label: 'Score vs Pipeline',
    name: 'score versus pipeline',
    legend: [
      ['PulseIQ Score (0–100)', '#1E3A8A'],
      ['Pipeline Opportunity ($)', '#059669'],
    ],
    polar: false,
  },
];

async function checkPulseIqTooltipAtEdge(cdp, dark, viewport, edge) {
  const position = await evaluate(cdp, `(() => {
    const chart = document.querySelector('.recharts-cartesian-grid')?.closest('.recharts-wrapper');
    const marks = [...(chart?.querySelectorAll('.recharts-bar-rectangle, path.recharts-rectangle, rect.recharts-rectangle') ?? [])]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    const columns = [...new Map(marks.map((mark) => [Math.round(mark.x), mark])).values()];
    return columns.length ? columns[${JSON.stringify(edge)} === 'first' ? 0 : columns.length - 1] : null;
  })()`);
  assert(position?.x != null,
    `${themeLabel(dark)} PulseIQ chart has no visible ${edge} mark at ${viewport.width}px`);

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: position.x,
    y: position.y,
  });
  await waitFor(cdp, `(() => {
    const tooltip = document.querySelector('.recharts-tooltip-wrapper');
    return Boolean(tooltip && getComputedStyle(tooltip).visibility !== 'hidden' && tooltip.innerText.trim());
  })()`, `${themeLabel(dark)} PulseIQ ${edge} chart tooltip`);

  for (const [labelType, longName] of [
    ['regional', 'Northwest Regional Emergency Medical Services and Fire Protection Authority'],
    ['agency', 'Metropolitan County Emergency Medical Services and Advanced Fire Response Department'],
  ]) {
    const state = await evaluate(cdp, `(() => {
      const chart = document.querySelector('.recharts-cartesian-grid')?.closest('.recharts-wrapper');
      const tooltip = document.querySelector('.recharts-tooltip-wrapper');
      const card = tooltip?.firstElementChild;
      const heading = tooltip?.querySelector('.font-semibold.text-slate-900');
      if (!chart || !tooltip || !card || !heading) return null;
      heading.textContent = ${JSON.stringify(longName)};
      const cardRect = card.getBoundingClientRect();
      const chartRect = chart.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      return {
        heading: heading.textContent,
        headingWidth: headingRect.width,
        headingScrollWidth: heading.scrollWidth,
        card: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom },
        chart: { left: chartRect.left, right: chartRect.right, top: chartRect.top, bottom: chartRect.bottom },
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`);
    assert(state && state.heading === longName,
      `${themeLabel(dark)} ${labelType} tooltip name was not rendered at the ${edge} mark`);
    assert(state.headingWidth > 0 && state.headingScrollWidth <= state.headingWidth + 1,
      `${themeLabel(dark)} ${labelType} tooltip name is clipped at the ${edge} mark: ${JSON.stringify(state)}`);
    assert(
      state.card.left >= Math.max(0, state.chart.left - 8) - 1 &&
        state.card.right <= Math.min(state.viewport.width, state.chart.right + 8) + 1 &&
        state.card.top >= Math.max(0, state.chart.top) - 1 &&
        state.card.bottom <= Math.min(state.viewport.height, state.chart.bottom) + 1,
      `${themeLabel(dark)} ${labelType} tooltip exceeds the chart edge tolerance or viewport at the ${edge} mark (${viewport.width}px): ${JSON.stringify(state)}`,
    );
  }
}

async function checkPulseIqCharts(cdp, dark, viewport) {
  await openPulseIqCharts(cdp);
  await setTheme(cdp, dark);

  for (const mode of pulseIqChartModes) {
    await clickButtonAndScroll(cdp, mode.label);
    await waitFor(
      cdp,
      mode.polar
        ? `Boolean(document.querySelector('.recharts-polar-grid'))`
        : `Boolean(document.querySelector('.recharts-cartesian-grid'))`,
      `${mode.name} chart grid`,
    );
    const state = await evaluate(cdp, `(() => {
      const svg = document.querySelector('.recharts-cartesian-grid, .recharts-polar-grid')?.closest('svg') ??
        document.querySelector('svg.recharts-surface');
      const legend = [...document.querySelectorAll('.recharts-legend-item')].map((item) => {
        const icon = item.querySelector('svg path, svg line, svg circle, svg polygon');
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const rawColor = icon?.getAttribute('fill') || iconStyle?.fill ||
          icon?.getAttribute('stroke') || iconStyle?.stroke || '';
        const match = rawColor.match(/#([\\da-f]{6})/i) ||
          rawColor.match(/rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)/i);
        const color = match
          ? match[0].startsWith('#')
            ? match[0].toUpperCase()
            : '#' + match.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase()
          : rawColor;
        return { label: item.innerText.trim(), color };
      });
      const gridElements = [...document.querySelectorAll(
        ${JSON.stringify(mode.polar
          ? '.recharts-polar-grid path, .recharts-polar-grid line, .recharts-polar-grid polygon'
          : '.recharts-cartesian-grid line')}
      )];
      const grid = gridElements.find((element) => getComputedStyle(element).stroke !== 'none');
      const tokenProbe = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tokenProbe.style.stroke = 'var(--pi-border)';
      svg?.appendChild(tokenProbe);
      const expectedGridStroke = getComputedStyle(tokenProbe).stroke;
      tokenProbe.remove();
      const axisTexts = [...document.querySelectorAll(
        ${JSON.stringify(mode.polar
          ? '.recharts-polar-angle-axis text, .recharts-polar-radius-axis text'
          : '.recharts-cartesian-axis-tick-value')}
      )].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.textContent.trim();
      });
      const pageOverflow = document.documentElement.scrollWidth > innerWidth;
      return {
        legend,
        gridCount: gridElements.length,
        gridStroke: grid ? getComputedStyle(grid).stroke : '',
        expectedGridStroke,
        axisCount: axisTexts.length,
        svgText: [...document.querySelectorAll('svg.recharts-surface text')]
          .slice(0, 12)
          .map((element) => ({
            className: element.getAttribute('class'),
            text: element.textContent.trim(),
            fill: getComputedStyle(element).fill,
            parentClass: element.parentElement?.getAttribute('class') ?? '',
          })),
        pageOverflow,
      };
    })()`);

    const expectedLegend = new Map(mode.legend);
    assert(state.legend.length === mode.legend.length &&
      new Set(state.legend.map((entry) => entry.label)).size === mode.legend.length &&
      state.legend.every((entry) => expectedLegend.get(entry.label) === entry.color),
    `${themeLabel(dark)} ${mode.name} legend or series palette changed: ${JSON.stringify(state.legend)}`);
    assert(state.axisCount > 0, `${themeLabel(dark)} ${mode.name} axis labels are missing: ${JSON.stringify(state.svgText)}`);
    assert(state.gridCount > 0 && state.gridStroke === state.expectedGridStroke,
      `${themeLabel(dark)} ${mode.name} grid does not use the theme border token: ${JSON.stringify(state)}`);
    assert(!state.pageOverflow, `${themeLabel(dark)} ${mode.name} overflows at ${viewport.width}px`);

    await checkReadable(cdp, `${themeLabel(dark)} ${mode.name}`, [
      {
        name: `${mode.name} axis label`,
        selector: mode.polar
          ? '.recharts-polar-angle-axis text, .recharts-polar-radius-axis text'
          : '.recharts-cartesian-axis-tick-value',
      },
      {
        name: `${mode.name} legend`,
        selector: '.recharts-legend-item',
      },
    ]);

    if (mode.tooltip) {
      await waitFor(cdp, `(() => {
        const chartSvg = document.querySelector('.recharts-cartesian-grid')?.closest('svg');
        return [...(chartSvg?.querySelectorAll('.recharts-bar-rectangle, path.recharts-rectangle, rect.recharts-rectangle') ?? [])]
          .some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2;
          });
      })()`, `${mode.name} visible bars`);
      await checkPulseIqTooltipAtEdge(cdp, dark, viewport, 'first');
      const tooltipState = await evaluate(cdp, `(() => {
        const tooltip = document.querySelector('.recharts-tooltip-wrapper > div');
        if (!tooltip) return null;
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--pi-surface-elevated)';
        document.body.appendChild(probe);
        const expectedSurface = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          surface: getComputedStyle(tooltip).backgroundColor,
          expectedSurface,
          text: tooltip.innerText.trim(),
        };
      })()`);
      assert(tooltipState && tooltipState.surface === tooltipState.expectedSurface,
        `${themeLabel(dark)} PulseIQ tooltip surface does not match the elevated theme token: ${JSON.stringify(tooltipState)}`);
      await checkReadable(cdp, `${themeLabel(dark)} PulseIQ tooltip`, [
        { name: 'tooltip heading', selector: '.recharts-tooltip-wrapper .font-semibold.text-slate-900' },
        { name: 'tooltip supporting text', selector: '.recharts-tooltip-wrapper .text-slate-700' },
      ]);
      await checkPulseIqTooltipAtEdge(cdp, dark, viewport, 'last');
    }

    console.log(
      `  ${themeLabel(dark)} ${viewport.width}px ${mode.name}: ${state.axisCount} axis labels, ${state.legend.length} distinct series, themed grid${mode.tooltip ? ', readable tooltip at first and last marks with long names' : ''}`,
    );
  }
  await captureThemeScreenshot(cdp, dark, 'pulseiq-specialty-charts');
}

async function openGisHeatmap(cdp) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before GIS heatmap checks');
  await clickButtonAndScroll(cdp, 'Browse agency directory');
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Territory views"]'))`, 'Territory views');
  await clickVisible(cdp, 'Fleet & response map', true);
  await waitFor(cdp, `Boolean(document.querySelector('h1')?.innerText.includes('High-Potential Territory Clusters'))`, 'GIS heatmap');
  await waitFor(cdp, `Boolean(document.querySelector('button[title="Toggle Spatial Legend"]'))`, 'GIS spatial legend control');
}

async function checkQuotaWarning(cdp, dark) {
  await setTheme(cdp, dark);
  await evaluate(cdp, `(() => {
    window.dispatchEvent(new Event('gmp-quota-exceeded'));
    window.dispatchEvent(new Event('gmp-quota-exceeded'));
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector('.pi-alert-banner[role="alert"]'))`, 'actionable Maps quota alert');
  const warning = await evaluate(cdp, `(() => {
    const banners = [...document.querySelectorAll('.pi-alert-banner')];
    const banner = banners[0];
    const text = banner?.innerText.trim() ?? '';
    return {
      count: banners.length,
      role: banner?.getAttribute('role'),
      live: banner?.getAttribute('aria-live'),
      text,
      actionable: text.includes('visit') && text.includes('update your account'),
      link: banner?.querySelector('a')?.innerText.trim() ?? '',
      linkTarget: banner?.querySelector('a')?.getAttribute('target') ?? '',
    };
  })()`);
  assert(
    warning.count === 1 &&
      warning.role === 'alert' &&
      warning.live === 'assertive' &&
      warning.actionable &&
      warning.link === 'maps developer site' &&
      warning.linkTarget === '_blank',
    `${themeLabel(dark)} Maps quota warning is not a single, actionable alert: ${JSON.stringify(warning)}`,
  );
  await checkReadable(cdp, `${themeLabel(dark)} Maps quota warning`, [
    { name: 'quota warning copy', selector: '.pi-alert-banner span' },
    { name: 'quota warning action', selector: '.pi-alert-banner a' },
  ]);
  console.log(`  ${themeLabel(dark)} Maps quota alert: one actionable warning with readable linked next step`);
}

async function checkGisLegendAndRiskColors(cdp, dark, viewport, layers = gisLayers) {
  await openGisHeatmap(cdp);
  await setTheme(cdp, dark);
  await clickButtonAndScroll(cdp, 'Station Vectors');
  await waitFor(cdp, `Boolean(document.querySelector('svg g.cursor-pointer.group[transform^="translate("] circle.transition-transform'))`, 'GIS station vector markers');

  const basemapButton = 'button[title="Switch between Tactical Dark and Daylight Survey cartography"]';
  for (const layer of layers) {
    await clickButtonAndScroll(cdp, layer.button);
    const displayMode = await evaluate(
      cdp,
      `document.querySelector('[data-testid="gis-map-svg"]')?.dataset.displayMode ?? ''`,
    );
    const legendTiers = layer.name === 'AED' && displayMode === 'choropleth'
      ? [{ id: 'unreported', label: 'No source-verified state data', swatchClass: 'bg-slate-500' }]
      : layer.tiers;
    await waitFor(
      cdp,
      `document.querySelectorAll('[data-testid="gis-layer-legend"] [data-risk-tier]').length === ${legendTiers.length}`,
      `${layer.name} risk legend`,
    );
    await evaluate(cdp, `document.querySelector('[data-testid="gis-layer-legend"]')?.scrollIntoView({ behavior: 'instant', block: 'start' })`);

    for (const basemap of ['Dark', 'Daylight']) {
      console.log(`  CHECK ${themeModeName(dark)} ${viewport.width}px ${layer.name} legend / ${basemap} basemap`);
      const currentBasemap = await evaluate(cdp, `document.querySelector(${JSON.stringify(basemapButton)})?.innerText.trim()`);
      if (currentBasemap !== basemap) {
        const clicked = await evaluate(cdp, `(() => {
          const button = document.querySelector(${JSON.stringify(basemapButton)});
          if (!button) return false;
          button.scrollIntoView({ behavior: 'instant', block: 'center' });
          button.click();
          return true;
        })()`);
        assert(clicked, `Could not find the GIS basemap toggle`);
        await waitFor(
          cdp,
          `document.querySelector(${JSON.stringify(basemapButton)})?.innerText.trim() === ${JSON.stringify(basemap)}`,
          `${basemap} GIS basemap`,
        );
      }
      await evaluate(cdp, `document.querySelector('[data-testid="gis-layer-legend"]')?.scrollIntoView({ behavior: 'instant', block: 'start' })`);

      const state = await evaluate(cdp, `(() => {
        const legend = document.querySelector('[data-testid="gis-layer-legend"]');
        const rows = [...(legend?.querySelectorAll('[data-risk-tier]') ?? [])].map((row) => ({
          id: row.dataset.riskTier,
          label: row.querySelector(':scope > span:last-child')?.innerText.trim() ?? '',
          color: getComputedStyle(row.querySelector(':scope > span:first-child')).backgroundColor,
          swatchClass: row.querySelector(':scope > span:first-child')?.className ?? '',
        }));
        const markerColors = [...document.querySelectorAll('svg g.cursor-pointer.group[transform^="translate("] circle.transition-transform')]
          .map((circle) => circle.getAttribute('fill'))
          .filter(Boolean);
        const bounds = legend?.getBoundingClientRect();
        return {
          legendVisible: Boolean(legend),
          rows,
          markerColors: [...new Set(markerColors)],
          legendFits: Boolean(bounds && bounds.left >= 0 && bounds.top >= 0 &&
            bounds.right <= innerWidth && bounds.bottom <= innerHeight),
          legendBounds: bounds ? {
            left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
          } : null,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      })()`);

      assert(state.legendVisible, `${themeLabel(dark)} ${layer.name} GIS legend is missing`);
      assert(state.rows.length === legendTiers.length &&
        legendTiers.every((tier) => {
          const row = state.rows.find((candidate) => candidate.id === tier.id);
          return row && row.label.includes(tier.label) && row.swatchClass.split(/\s+/).includes(tier.swatchClass);
        }),
      `${themeLabel(dark)} ${layer.name} ${basemap} legend labels or source colors changed: ${JSON.stringify(state.rows)}`);
      assert(new Set(state.rows.map((row) => row.color)).size === legendTiers.length &&
        state.rows.every((row) => row.color && row.swatchClass),
      `${themeLabel(dark)} ${layer.name} ${basemap} risk colors are not distinct: ${JSON.stringify(state.rows)}`);
      assert(state.markerColors.length > 0 &&
        state.markerColors.every((color) => layer.markerColors.includes(color) || color === '#10B981'),
      `${themeLabel(dark)} ${layer.name} ${basemap} station markers do not use the layer palette: ${JSON.stringify(state.markerColors)}`);
      assert(state.legendFits, `${themeLabel(dark)} ${layer.name} legend is clipped at ${viewport.width}px: ${JSON.stringify(state)}`);
      assert(!state.pageOverflow, `${layer.name} GIS heatmap overflows at ${viewport.width}px`);

      await checkReadable(cdp, `${themeLabel(dark)} ${viewport.width}px ${layer.name} ${basemap} legend`, [
        { name: `${layer.name} legend heading`, selector: '[data-testid="gis-layer-legend"] .text-slate-200' },
        ...legendTiers.map((tier) => ({
          name: `${layer.name} ${tier.id} label`,
          selector: `[data-testid="gis-layer-legend"] [data-risk-tier="${tier.id}"] > span:last-child`,
        })),
      ]);

      if (layer.name === 'OHCA' && basemap === 'Dark') {
        const marker = await evaluate(cdp, `(() => {
          const legend = document.querySelector('[data-testid="gis-layer-legend"]')?.getBoundingClientRect();
          const candidates = [...document.querySelectorAll('svg g.cursor-pointer.group[transform^="translate("] circle.transition-transform')]
            .map((circle) => ({ circle, rect: circle.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 2 && rect.height > 2 &&
              rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight);
          const target = candidates.find(({ rect }) => !legend ||
            rect.right < legend.left || rect.left > legend.right || rect.bottom < legend.top || rect.top > legend.bottom);
          if (!target) return null;
          const rect = target.rect;
          target.circle.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`);
        assert(marker, `${themeLabel(dark)} GIS map has no visible station marker to inspect`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: marker.x, y: marker.y });
        await waitFor(
          cdp,
          `Boolean(document.querySelector('.absolute.bottom-12.left-4 h4.text-white'))`,
          `${themeLabel(dark)} GIS station tooltip`,
        );
        await checkReadable(cdp, `${themeLabel(dark)} GIS station tooltip`, [
          { name: 'GIS tooltip agency name', selector: '.absolute.bottom-12.left-4 h4.text-white' },
          { name: 'GIS tooltip supporting text', selector: '.absolute.bottom-12.left-4 .text-slate-400' },
        ]);
      }

      console.log(
        `  ${themeLabel(dark)} ${viewport.width}px GIS ${layer.name} ${basemap}: ${state.rows.length} legend tiers; ${state.markerColors.length} source-colored marker fills`,
      );
    }
  }
}

async function checkGisHeatAndChoroplethRiskColors(cdp, dark, viewport, layers = gisRiskLayers, modes = ['kde', 'hexbin', 'choropleth']) {
  await openGisHeatmap(cdp);
  await setTheme(cdp, dark);
  const basemapButton = 'button[title="Switch between Tactical Dark and Daylight Survey cartography"]';
  const views = [
    { name: 'Thermal KDE', mode: 'kde' },
    { name: 'H3 Hexbins', mode: 'hexbin' },
    { name: 'Choropleth', mode: 'choropleth' },
  ];

  for (const layer of layers) {
    await clickTestIdAndScroll(cdp, `gis-risk-layer-${layer.id}`);
    for (const view of views.filter((view) => modes.includes(view.mode))) {
      await clickTestIdAndScroll(cdp, `gis-map-mode-${view.mode}`);
      await waitFor(
        cdp,
        `document.querySelector('[data-testid="gis-map-svg"]')?.dataset.displayMode === ${JSON.stringify(view.mode)} &&
          document.querySelector('[data-testid="gis-map-svg"]')?.dataset.selectedLayer === ${JSON.stringify(layer.id)}`,
        `${layer.name} ${view.name} selection`,
      );

      if (view.mode !== 'choropleth') {
        await clickTestIdAndScroll(cdp, 'gis-spectrum-viridis');
      }

      for (const basemap of ['Dark', 'Daylight']) {
        console.log(`  CHECK ${themeModeName(dark)} ${viewport.width}px ${layer.name} ${view.mode} / ${basemap} basemap`);
        const currentBasemap = await evaluate(cdp, `document.querySelector(${JSON.stringify(basemapButton)})?.innerText.trim()`);
        if (currentBasemap !== basemap) {
          const clicked = await evaluate(cdp, `(() => {
            const button = document.querySelector(${JSON.stringify(basemapButton)});
            if (!button) return false;
            button.scrollIntoView({ behavior: 'instant', block: 'center' });
            button.click();
            return true;
          })()`);
          assert(clicked, `${themeLabel(dark)} ${layer.name} ${view.name}: GIS basemap toggle is missing`);
          await waitFor(
            cdp,
            `document.querySelector(${JSON.stringify(basemapButton)})?.innerText.trim() === ${JSON.stringify(basemap)}`,
            `${basemap} GIS basemap`,
          );
        }

        await waitFor(
          cdp,
          `document.querySelector('[data-testid="gis-map-svg"]')?.dataset.basemapTheme === ${JSON.stringify(basemap === 'Dark' ? 'dark' : 'light')}`,
          `${basemap} ${layer.name} ${view.name} map`,
        );
        const rampLabels = await evaluate(cdp, `(() => ({
          low: document.querySelector('[data-testid="gis-intensity-low-label"]')?.innerText.trim() ?? '',
          middle: document.querySelector('[data-testid="gis-intensity-mid-label"]')?.innerText.trim() ?? '',
          high: document.querySelector('[data-testid="gis-intensity-high-label"]')?.innerText.trim() ?? '',
          explanation: document.querySelector('[data-testid="gis-intensity-explanation"]')?.innerText.trim() ?? '',
        }))()`);

        if (view.mode === 'choropleth') {
          const stateColors = await evaluate(cdp, `(() => {
            const allStates = [...document.querySelectorAll('[data-testid="gis-state-choropleth"]')]
              .map((path) => ({
                state: path.dataset.gisState,
                tier: path.dataset.riskTier,
                label: path.dataset.metricLabel ?? '',
                value: path.dataset.metricValue ?? '',
                fill: path.getAttribute('fill')?.toLowerCase() ?? '',
              }));
            const states = allStates.filter((state) => state.value !== 'Not reported');
            return {
              count: states.length,
              allStateCount: allStates.length,
              unreportedCount: allStates.filter((state) => state.value === 'Not reported').length,
              colors: [...new Set(states.map((state) => state.fill))],
              states,
              allStates,
              explanation: document.querySelector('[data-testid="gis-aed-state-data-note"]')?.innerText.trim() ?? '',
              legendTier: document.querySelector('[data-testid="gis-layer-legend"] [data-risk-tier="unreported"]')?.innerText.trim() ?? '',
            };
          })()`);
          if (layer.id === 'aed') {
            const noDataFill = basemap === 'Dark' ? '#0c1629' : '#e2e8f0';
            assert(stateColors.count === 0 &&
              stateColors.allStateCount > 0 &&
              stateColors.unreportedCount === stateColors.allStateCount &&
              stateColors.allStates.every((state) =>
                state.tier === 'unreported' &&
                state.label.includes('Source-verified AED access deficit') &&
                state.fill === noDataFill) &&
              stateColors.explanation.includes('no risk tier is assigned') &&
              stateColors.legendTier.includes('No source-verified state data'),
            `${themeLabel(dark)} ${viewport.width}px AED ${basemap} choropleth shows unsupported state metrics or lacks its source-coverage warning: ${JSON.stringify(stateColors)}`);
            assert(!rampLabels.low && !rampLabels.high,
              `AED choropleth should not display the continuous heat ramp: ${JSON.stringify(rampLabels)}`);
            console.log(
              `  ${themeLabel(dark)} ${viewport.width}px AED ${basemap} choropleth: ${stateColors.allStateCount} states marked unreported; no unsupported risk tiers`,
            );
            continue;
          }
          assert(stateColors.count > 0,
            `${themeLabel(dark)} ${viewport.width}px ${layer.name} ${basemap} choropleth has no reported state metrics`);
          assert(new Set(Object.values(layer.stateColors)
            .map((colors) => colors[basemap === 'Dark' ? 'dark' : 'light'])).size === 4,
          `${themeLabel(dark)} ${layer.name} ${basemap} choropleth palette collapses distinct risk tiers`);
          for (const state of stateColors.states) {
            const expectedColor = layer.stateColors[state.tier]?.[basemap === 'Dark' ? 'dark' : 'light'];
            assert(expectedColor && state.fill === expectedColor,
              `${themeLabel(dark)} ${layer.name} ${basemap} ${state.state} ${state.tier} color is not risk-coded as expected: ${JSON.stringify(state)}`);
            assert(state.label.includes(layer.meaning),
              `${themeLabel(dark)} ${layer.name} ${basemap} state label does not explain risk direction: ${JSON.stringify(state)}`);
          }
          assert(!rampLabels.low && !rampLabels.high,
            `${layer.name} choropleth should not display the continuous heat ramp: ${JSON.stringify(rampLabels)}`);
          console.log(
            `  ${themeLabel(dark)} ${viewport.width}px GIS ${layer.name} ${basemap} choropleth: ${stateColors.count} reported states, ${stateColors.colors.length} risk colors, labels explain ${layer.meaning}`,
          );
          continue;
        }

        assert(rampLabels.low === layer.low && rampLabels.high === layer.high &&
          rampLabels.middle === 'Median intensity' &&
          rampLabels.explanation.includes(layer.metric),
        `${themeLabel(dark)} ${layer.name} ${basemap} ${view.name} risk labels do not match the layer meaning: ${JSON.stringify(rampLabels)}`);

        if (view.mode === 'kde') {
          const surface = await evaluate(cdp, `(() => {
            const image = document.querySelector('[data-testid="gis-kde-surface"]');
            return {
              present: Boolean(image),
              metric: image?.getAttribute('data-layer-risk-metric') ?? '',
              href: image?.getAttribute('href') ?? '',
            };
          })()`);
          assert(surface.present && surface.metric === layer.metric && surface.href.startsWith('data:image/png;base64,'),
            `${themeLabel(dark)} ${layer.name} ${basemap} KDE surface is missing or detached from its risk metric: ${JSON.stringify(surface)}`);
          const pixels = await evaluate(cdp, `(async () => {
            const source = document.querySelector('[data-testid="gis-kde-surface"]')?.getAttribute('href');
            if (!source) return null;
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const colors = new Set();
            let visiblePixels = 0;
            for (let index = 0; index < data.length; index += 4) {
              if (data[index + 3] < 100) continue;
              visiblePixels++;
              colors.add(data[index] + ',' + data[index + 1] + ',' + data[index + 2]);
            }
            return { visiblePixels, distinctColors: colors.size };
          })()`);
          assert(pixels && pixels.visiblePixels > 20 && pixels.distinctColors > 4,
            `${themeLabel(dark)} ${layer.name} ${basemap} KDE has no meaningful risk-weighted color surface: ${JSON.stringify(pixels)}`);
        } else {
          const bins = await evaluate(cdp, `(() => [...document.querySelectorAll('[data-testid="gis-risk-hex"]')]
            .map((polygon) => ({
              intensity: Number(polygon.dataset.riskIntensity),
              fill: polygon.getAttribute('fill') ?? '',
            }))
            .filter((bin) => Number.isFinite(bin.intensity)))()`);
          assert(bins.length > 1,
            `${themeLabel(dark)} ${layer.name} ${basemap} hexbin view has too few risk cells to verify color direction`);
          const sortedBins = bins.sort((first, second) => first.intensity - second.intensity);
          const luminance = (fill) => {
            const match = fill.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
            assert(match, `${layer.name} hexbin color is not a rendered RGB value: ${fill}`);
            const [red, green, blue] = match.slice(1).map((channel) => Number(channel) / 255);
            const linear = (channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
          };
          assert(sortedBins.at(-1).intensity > sortedBins[0].intensity &&
            luminance(sortedBins.at(-1).fill) > luminance(sortedBins[0].fill),
          `${themeLabel(dark)} ${layer.name} ${basemap} hexbin colors do not brighten with increasing risk intensity: ${JSON.stringify([sortedBins[0], sortedBins.at(-1)])}`);
        }

        console.log(
          `  ${themeLabel(dark)} ${viewport.width}px GIS ${layer.name} ${basemap} ${view.name}: ${rampLabels.low} → ${rampLabels.high}`,
        );
      }
    }
  }
}

async function runViewport(cdp, viewport, gisGroup) {
  console.log(`Checking ${viewport.width}×${viewport.height}...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.home-map-state-path'))`,
    `Home map at ${viewport.width}px`,
  );
  if (gisGroup) {
    if (gisGroup.check === 'legend') {
      await checkGisLegendAndRiskColors(cdp, gisGroup.theme, viewport,
        gisLayers.filter((layer) => layer.name.toLowerCase() === gisGroup.layer));
    } else {
      await checkGisHeatAndChoroplethRiskColors(cdp, gisGroup.theme, viewport,
        gisRiskLayers.filter((layer) => layer.name.toLowerCase() === gisGroup.layer), [gisGroup.check]);
    }
    return;
  }
  if (process.env.THEME_STARTUP_ONLY === '1') {
    await checkThemeModeSelection(cdp, viewport);
    console.log(`PASS ${viewport.width}×${viewport.height}: theme selection remains available, new sessions always start in Daylight`);
    return;
  }
  if (process.env.THEME_NAVIGATION_ONLY === '1') {
    await checkHome(cdp, false);
    await checkHome(cdp, true);
    await checkHome(cdp, 'miami-vice');
    console.log(`PASS ${viewport.width}×${viewport.height}: active navigation, focus ring, and horizontal overflow in all themes`);
    return;
  }
  if (process.env.THEME_PROFILE_RETURN_ONLY === '1') {
    await setTheme(cdp, 'daylight');
    const selectedFlorida = await evaluate(cdp, `(() => {
      const state = [...document.querySelectorAll('.home-map-state-path')]
        .find((path) => path.getAttribute('aria-label')?.startsWith('Florida.'));
      state?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return Boolean(state);
    })()`);
    assert(selectedFlorida, 'Could not select Florida from the national map');
    await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen'))`, 'Florida county directory');
    await openProfile(cdp);
    await checkProfileBackRestoration(cdp, viewport);
    await checkAgencyEmptyRecovery(cdp);
    if (viewport.mobile) {
      await clickVisible(cdp, '.pi-mobile-nav button[aria-label="Map"]');
    } else {
      await clickVisible(cdp, 'Map', true);
    }
    await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path[aria-label^="Florida."][aria-pressed="true"]'))`, 'Florida map after agency return');
    await clickButtonAndScroll(cdp, 'National view');
    await waitFor(cdp, `!document.querySelector('.home-map-state-path[aria-pressed="true"]')`, 'national map reset');
    console.log(`PASS ${viewport.width}×${viewport.height}: state → agency → Back restores search, filters, geography, scroll, and national map`);
    return;
  }
  if (process.env.THEME_PROFILE_LAYOUT_ONLY === '1') {
    await setTheme(cdp, 'daylight');
    await openProfile(cdp);
    await evaluate(cdp, `(() => { for (const selector of ['.profile-more-actions','[data-testid="profile-record-context"]']) { const details = document.querySelector(selector); if (details) details.open = true; } })()`);
    const layout = await evaluate(cdp, `(() => {
      const profile = document.querySelector('main.profile-workspace');
      const rect = profile?.getBoundingClientRect();
      return {
        agency: document.querySelector('[data-testid="text-agency-name"]')?.innerText.trim() ?? '',
        profileWidth: profile?.clientWidth ?? 0,
        profileScrollWidth: profile?.scrollWidth ?? 0,
        pageWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        overflowing: [...(profile?.querySelectorAll('*') ?? [])].filter((element) => {
          const child = element.getBoundingClientRect();
          return child.width > 0 && (child.right > rect.right + 2 || child.left < rect.left - 2);
        }).slice(0, 10).map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          text: element.textContent?.trim().slice(0, 80) ?? '',
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
        })),
      };
    })()`);
    console.log(`  ${viewport.width}px profile layout: ${JSON.stringify(layout)}`);
    return;
  }
  if (process.env.THEME_COMPARISON_ONLY === '1') {
    await openAgencyComparison(cdp);
    console.log(`PASS ${viewport.width}×${viewport.height}: agency comparison selection and context`);
    return;
  }
  if (process.env.THEME_PULSEIQ_ONLY === '1') {
    for (const themeMode of ['daylight', 'dark', 'miami-vice']) {
      await checkPulseIqCharts(cdp, themeMode, viewport);
    }
    console.log(`PASS ${viewport.width}×${viewport.height}: Reports → Territory priorities charts in all themes`);
    return;
  }
  if (process.env.THEME_TASK_WORKFLOW_ONLY === '1') {
    await checkTaskWorkflow(cdp, viewport);
    console.log(`PASS ${viewport.width}×${viewport.height}: follow-up workflow remains functional at this viewport`);
    return;
  }
  if (process.env.THEME_SELECTION_ONLY === '1') {
    await checkThemeSelectionWithKeyboard(cdp, viewport);
    console.log(`PASS ${viewport.width}×${viewport.height}: pointer/keyboard theme selection`);
    return;
  }
  if (process.env.THEME_WORKSPACE_AUDIT_ONLY === '1') {
    for (const themeMode of ['daylight', 'dark', 'miami-vice']) {
      await checkWorkspaceDestinations(cdp, themeMode, viewport);
    }
    console.log(`PASS ${viewport.width}×${viewport.height}: Reports, Settings, imports, recovery, source tools, and specialist screens in all themes`);
    return;
  }
  if (process.env.THEME_SPECIALTY_ONLY === '1') {
    await checkPulseIqCharts(cdp, false, viewport);
    await checkPulseIqCharts(cdp, true, viewport);
    await checkPulseIqCharts(cdp, 'miami-vice', viewport);
    await checkGisLegendAndRiskColors(cdp, false, viewport);
    await checkGisLegendAndRiskColors(cdp, true, viewport);
    await checkGisLegendAndRiskColors(cdp, 'miami-vice', viewport);
    console.log(`PASS ${viewport.width}×${viewport.height}: specialty charts and GIS legend in all three themes`);
    return;
  }
  await checkThemeModeSelection(cdp, viewport);
  await checkHome(cdp, false);
  await checkThemeStates(cdp, false, viewport);
  await checkActualDialogs(cdp, false, viewport);
  await checkHome(cdp, true);
  await checkThemeStates(cdp, true, viewport);
  await checkActualDialogs(cdp, true, viewport);
  await checkHome(cdp, 'miami-vice');
  await checkThemeStates(cdp, 'miami-vice', viewport);

  await clickButtonAndScroll(cdp, 'Browse agency directory');
  await waitFor(cdp, `Boolean(document.querySelector('.territory-explorer-screen #home-state-picker'))`, 'Territory state selector');
  const selectedState = await evaluate(cdp, `(() => {
    const select = document.querySelector('#home-state-picker');
    if (!select) return false;
    select.value = 'FL';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(selectedState, 'Could not select Florida for county summary verification');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('.county-directory-heading')) &&
      Boolean(document.querySelector('.county-signal-row'))`,
    'Florida county summary cards',
  );
  await checkCounty(cdp, false);
  await checkCounty(cdp, true);
  await checkCounty(cdp, 'miami-vice');

  await openProfile(cdp);
  await checkProfileAndSources(cdp, false);
  await checkProfileAndSources(cdp, true);
  await checkProfileAndSources(cdp, 'miami-vice');
  await checkProfileBackRestoration(cdp, viewport);

  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before agency comparison checks');
  const selectedIds = await openAgencyComparison(cdp);
  await checkAgencyComparison(cdp, false, selectedIds);
  await checkAgencyComparison(cdp, true, selectedIds);
  await checkAgencyComparison(cdp, 'miami-vice', selectedIds);
  await openFieldWork(cdp);
  await checkFieldWork(cdp, false, viewport);
  await checkFieldWork(cdp, true, viewport);
  await checkFieldWork(cdp, 'miami-vice', viewport);
  await checkPulseIqCharts(cdp, false, viewport);
  await checkPulseIqCharts(cdp, true, viewport);
  await checkPulseIqCharts(cdp, 'miami-vice', viewport);
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before quota warning checks');
  await checkQuotaWarning(cdp, false);
  await checkQuotaWarning(cdp, true);
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before GIS checks');
  await checkGisLegendAndRiskColors(cdp, false, viewport);
  await checkGisLegendAndRiskColors(cdp, true, viewport);
  await checkGisLegendAndRiskColors(cdp, 'miami-vice', viewport);
  await checkGisHeatAndChoroplethRiskColors(cdp, false, viewport);
  await checkGisHeatAndChoroplethRiskColors(cdp, true, viewport);
  console.log(`PASS ${viewport.width}×${viewport.height}: Home, Territory, Agencies, Field Work, profile, comparison, charts, and GIS in all themes`);
}

async function withBrowser(run, timeoutMs) {
  const debuggingPort = await reservePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ems-theme-readability-'));
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
  const controller = new AbortController();
  const chromiumClosed = new Promise((resolve) => chromium.once('close', resolve));
  const abort = (message) => {
    const error = new Error(message);
    error.code = 'HARNESS_INCOMPLETE';
    controller.abort(error);
  };
  const onSigterm = () => abort('Interrupted by SIGTERM; remaining checks were not run.');
  const onSigint = () => abort('Interrupted by SIGINT; remaining checks were not run.');
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);
  let timer;
  const interrupted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    chromium.once('error', reject);
    if (timeoutMs) {
      timer = setTimeout(() => abort(`GIS group exceeded ${timeoutMs}ms; this is an incomplete check, not a visual assertion failure.`), timeoutMs);
    }
  });
  try {
    await Promise.race([interrupted, (async () => {
      const target = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`, 15_000, controller.signal);
      const targets = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/list`, 15_000, controller.signal);
      controller.signal.throwIfAborted();
      const page = targets.find((candidate) => candidate.type === 'page');
      assert(page, 'Chromium did not create a page target');
      cdp = createCdpClient(page.webSocketDebuggerUrl ?? target.webSocketDebuggerUrl);
      await cdp.connect();
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await run(cdp);
    })()]);
  } finally {
    clearTimeout(timer);
    controller.abort(new Error('Browser session finished'));
    cdp?.close();
    try {
      if (chromium.pid) process.kill(-chromium.pid, 'SIGTERM');
    } catch {
      // Chromium may already have exited.
    }
    await Promise.race([
      chromiumClosed,
      new Promise((resolve) => setTimeout(resolve, 1_500)),
    ]);
    try {
      if (chromium.pid) process.kill(-chromium.pid, 'SIGKILL');
    } catch {
      // Chromium may already have exited.
    }
    await Promise.race([
      chromiumClosed,
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    try {
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } finally {
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGINT', onSigint);
    }
  }
}

async function main() {
  assert(process.env.THEME_TEST_WIDTH === undefined || Number.isInteger(requestedWidth) && requestedWidth > 0,
    `Invalid THEME_TEST_WIDTH: ${process.env.THEME_TEST_WIDTH}`);
  assert(viewports.length > 0, `Unsupported THEME_TEST_WIDTH: ${process.env.THEME_TEST_WIDTH}`);
  const gisOnly = process.env.THEME_GIS_ONLY === '1' || process.env.THEME_GIS_RISK_ONLY === '1';
  const listGroups = process.argv.includes('--list-gis-groups');
  const hasGisFilters = ['THEME_GIS_THEMES', 'THEME_GIS_LAYERS', 'THEME_GIS_CHECKS', 'THEME_GIS_GROUP_TIMEOUT_MS']
    .some((name) => process.env[name] !== undefined);
  assert(gisOnly || listGroups || !hasGisFilters, 'GIS filters require THEME_GIS_ONLY=1 or THEME_GIS_RISK_ONLY=1');
  if (gisOnly || listGroups) {
    const groups = planGisGroups();
    const timeoutMs = gisGroupTimeout();
    const jobs = viewports.flatMap((viewport) => groups.map((group) => ({ viewport, group })));
    console.log(`GIS plan: ${jobs.length} groups; both basemaps per group; ${timeoutMs}ms budget per fresh browser.`);
    if (listGroups) {
      for (const { viewport, group } of jobs) console.log(`${viewport.width}px ${group.id}`);
      return;
    }
    let completed = 0;
    for (const { viewport, group } of jobs) {
      const label = `${viewport.width}px ${group.id}`;
      const started = Date.now();
      console.log(`START [${completed + 1}/${jobs.length}] ${label}`);
      try {
        await withBrowser((cdp) => runViewport(cdp, viewport, group), timeoutMs);
      } catch (error) {
        console.error(`${error.code === 'HARNESS_INCOMPLETE' ? 'INCOMPLETE' : 'FAIL'} ${label}; ${completed}/${jobs.length} groups passed.`);
        console.error(`Rerun: THEME_GIS_ONLY=1 THEME_TEST_WIDTH=${viewport.width} THEME_GIS_THEMES=${group.theme} THEME_GIS_LAYERS=${group.layer} THEME_GIS_CHECKS=${group.check} node scripts/check-theme-readability.mjs`);
        throw error;
      }
      completed++;
      console.log(`PASS [${completed}/${jobs.length}] ${label} (${((Date.now() - started) / 1000).toFixed(1)}s; browser cleaned up)`);
    }
    console.log(`PASS GIS: all ${completed} selected groups completed at ${viewports.map(({ width }) => width).join(', ')}px.`);
    return;
  }
  await withBrowser(async (cdp) => {
    for (const viewport of viewports) await runViewport(cdp, viewport);
  });
  console.log(`Theme readability checks passed at selected widths: ${viewports.map(({ width }) => width).join(', ')}px.`);
}

main().catch((error) => {
  console.error(`Theme readability check ${error.code === 'HARNESS_INCOMPLETE' ? 'incomplete' : 'failed'}: ${error.stack ?? error.message}`);
  process.exitCode = error.code === 'HARNESS_INCOMPLETE' ? 2 : 1;
});
