import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.THEME_TEST_URL ?? `http://127.0.0.1:${process.env.PORT ?? '24938'}/`;
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const allViewports = [
  { width: 390, height: 844, mobile: true },
  { width: 1280, height: 900, mobile: false },
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
        }, 30_000);
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
  const isDark = themeMode === 'dark';
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
      };
    })()`);
    assert(state.mode === themeMode, `Theme selector did not apply ${themeLabel(themeMode)}`);
    assert(state.darkClass === (themeMode === 'dark'), `${themeLabel(themeMode)} did not set the expected color scheme`);
    assert(state.selectedValue === themeMode, `${themeLabel(themeMode)} selection was not saved`);
    assert(state.legacyValue === String(themeMode === 'dark'), `${themeLabel(themeMode)} did not preserve legacy preference compatibility`);
    if (themeMode === 'miami-vice') {
      assert(!state.darkClass && state.colorScheme === 'light', `Miami Vice should not inherit Dark mode: ${JSON.stringify(state)}`);
      assert(
        state.canvas === '#f7f4eb' &&
          state.surface === '#fffcfa' &&
          state.subtleSurface === '#e9f6f5' &&
          state.primaryText === '#18344b' &&
          state.action === '#007f8b' &&
          state.legacyCanvas === state.canvas,
        `Miami Vice pastel palette or legacy aliases are missing: ${JSON.stringify(state)}`,
      );
      assert(state.accent === '#e94b8b', `Miami Vice pink accent token is missing: ${JSON.stringify(state)}`);
      assert(state.activeBorder === state.accentColor, `Miami Vice active navigation accent is missing: ${JSON.stringify(state)}`);
      await captureThemeScreenshot(cdp, themeMode, 'home');
    }
  }

  await reloadAndWaitForTheme(cdp, 'miami-vice', 'Miami Vice preference after reload');
  await evaluate(cdp, `(() => {
    localStorage.removeItem('app_theme_mode');
    localStorage.setItem('app_dark_mode', 'false');
  })()`);
  await reloadAndWaitForTheme(cdp, 'daylight', 'legacy Daylight preference migration');
  await evaluate(cdp, `(() => {
    localStorage.removeItem('app_theme_mode');
    localStorage.setItem('app_dark_mode', 'true');
  })()`);
  await reloadAndWaitForTheme(cdp, 'dark', 'legacy Dark preference migration');
  console.log(`  ${viewport.width}px: all three theme options, persistence, and legacy Daylight/Dark preference migration`);
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
    return samples.map(({ name, selector, backgroundRgb }) => {
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
  const metrics = await evaluate(cdp, `(() => {
    const metric = document.querySelector('[data-testid="select-state-map-metric"]');
    return metric ? [...metric.options].map((option) => option.value) : [];
  })()`);
  let missingLayer = null;
  for (const metricValue of metrics) {
    await evaluate(cdp, `(() => {
      const metric = document.querySelector('[data-testid="select-state-map-metric"]');
      if (!metric) return false;
      metric.value = ${JSON.stringify(metricValue)};
      metric.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="select-state-map-metric"]')?.value === ${JSON.stringify(metricValue)}`,
      `${metricValue} map layer in ${themeLabel(dark)} theme`,
    );
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
      selectedHasDoubleOutline: paths.some((path) => path.getAttribute('stroke') === '#67D6CE') &&
        paths.some((path) => path.getAttribute('stroke') === '#F4C86A'),
      missingFill: missing?.getAttribute('fill') ?? '',
      missingLegend,
      missingHasText: missingLegend.includes('Not reported'),
      missingHasPattern: Boolean(document.querySelector('#home-map-missing-data')),
      missingHasHatch: Boolean(document.querySelector('.home-map-legend-missing-note')?.innerText.includes('Hatch')),
      regionHasSelection: Boolean(document.querySelector('.home-map-region-filter button[aria-pressed="true"]')),
      controls: Boolean(document.querySelector('[data-testid="select-state-map-metric"]') &&
        document.querySelector('[data-testid="button-map-zoom-in"]')),
    };
  })()`);
  assert(
    stateCue.selected && stateCue.selectedIsDescribed && stateCue.selectedHasDoubleOutline &&
      stateCue.missingHasText && stateCue.missingHasPattern && stateCue.missingHasHatch &&
      stateCue.regionHasSelection &&
      stateCue.controls,
    `Home selected/missing/control cues are incomplete in ${themeLabel(dark)} theme: ${JSON.stringify(stateCue)}`,
  );
  if (!missingLayer) {
    console.log(`  ${themeLabel(dark)} Home: no selected map layer currently has unavailable state data; missing fill definition and textual legend are present.`);
  } else {
    console.log(`  ${themeLabel(dark)} Home: ${missingLayer.missingCount} missing states use the hatched fill on ${missingLayer.metricValue}.`);
  }
  await checkReadable(cdp, `${themeLabel(dark)} Home`, [
    { name: 'map metric control', selector: '[data-testid="select-state-map-metric"]' },
    { name: 'selected region label', selector: '.home-map-region-filter button[aria-pressed="true"]' },
    { name: 'map legend heading', selector: '.home-map-legend-title', backgroundRgb: [12, 29, 41] },
    { name: 'missing-data legend', selector: '.home-map-legend-missing', backgroundRgb: [12, 29, 41] },
  ]);
}

async function checkCounty(cdp, dark) {
  await setTheme(cdp, dark);
  const summary = await evaluate(cdp, `(() => {
    const panel = document.querySelector('.county-state-summary-panel');
    const card = document.querySelector('.county-profile-card');
    const title = card?.querySelector('h3');
    const missing = [...(card?.querySelectorAll('*') ?? [])]
      .find((element) => element.children.length === 0 && /not reported/i.test(element.textContent ?? ''));
    return {
      summaryText: panel?.innerText.trim().slice(0, 400) ?? '',
      cardTitle: title?.innerText.trim() ?? '',
      missingLabel: missing?.textContent.trim() ?? '',
      countyCount: document.querySelectorAll('.county-profile-card').length,
    };
  })()`);
  assert(summary.summaryText.length > 20, `${themeLabel(dark)} county summary is empty`);
  assert(summary.cardTitle, `${themeLabel(dark)} county card title is missing`);
  assert(summary.countyCount > 0, `${themeLabel(dark)} county cards are missing`);
  await checkReadable(cdp, `${themeLabel(dark)} county`, [
    { name: 'county card title', selector: '.county-profile-card h3' },
    { name: 'county summary heading', selector: '.county-state-summary-panel h4' },
  ]);
  console.log(
    `  ${themeLabel(dark)} county state: ${summary.countyCount} cards; missing-data label ${summary.missingLabel || 'not present in first card'}`,
  );
  await captureThemeScreenshot(cdp, dark, 'territory');
}

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
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((candidate) => candidate.innerText.trim().startsWith('Open agency profile'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Could not open a provider profile');
  await waitFor(cdp, `Boolean(document.querySelector('main.profile-workspace'))`, 'provider profile');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('main.profile-workspace [aria-label="Agency contact summary"]')) &&
      Boolean(document.querySelector('main.profile-workspace [aria-label="Available source references"]'))`,
    'provider identity and source summary',
  );
}

async function checkProfileAndSources(cdp, dark) {
  await setTheme(cdp, dark);
  const profileCues = await evaluate(cdp, `(() => {
    const status = document.querySelector('[data-testid^="status-profile-review-"]');
    const source = document.querySelector('[aria-label="Available source references"]');
    return {
      statusText: status?.innerText.trim() ?? '',
      statusHasAccessibleState: Boolean(status?.getAttribute('aria-live')),
      sourcePanel: Boolean(source && source.innerText.trim()),
        sourceAction: Boolean(source?.querySelector('button')),
    };
  })()`);
  assert(profileCues.statusText, `${themeLabel(dark)} profile status is missing`);
  assert(profileCues.statusHasAccessibleState, 'Profile review status is not announced accessibly');
  assert(profileCues.sourcePanel, 'Available source references panel is missing');
  assert(profileCues.sourceAction, 'Available source references action is missing');
  await checkReadable(cdp, `${themeLabel(dark)} provider profile`, [
    { name: 'profile review status', selector: '[data-testid^="status-profile-review-"]' },
    { name: 'source references heading', selector: '[aria-label="Available source references"] h2' },
    { name: 'source references action', selector: '[aria-label="Available source references"] button' },
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
    const selected = await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('button[data-testid^="button-toggle-comparison-"]')]
        .find((candidate) => candidate.dataset.testid === ${JSON.stringify(`button-toggle-comparison-${agencyId}`)});
      if (!button || button.disabled || button.getAttribute('aria-pressed') === 'true') return false;
      button.click();
      return true;
    })()`);
    assert(selected, `Could not select agency ${agencyId} for comparison`);
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
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const label = (candidate.getAttribute('aria-label') || candidate.innerText).trim().toLowerCase();
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
}

async function openPulseIqCharts(cdp) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before specialty chart checks');
  await clickVisible(cdp, 'Opportunities', true);
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Opportunities views"]'))`, 'Opportunities views');
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
      const position = await evaluate(cdp, `(() => {
        const chartSvg = document.querySelector('.recharts-cartesian-grid')?.closest('svg');
        const candidates = [...(chartSvg?.querySelectorAll('.recharts-bar-rectangle, path.recharts-rectangle, rect.recharts-rectangle') ?? [])];
        const bar = candidates.find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 2 && rect.height > 2;
        });
        if (!bar) return {
          candidates: candidates.length,
          candidateDetails: candidates.slice(0, 12).map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              className: typeof element.className === 'string'
                ? element.className
                : element.className?.baseVal ?? '',
              box: [rect.x, rect.y, rect.width, rect.height],
              childCount: element.children.length,
            };
          }),
          chartShapes: [...(chartSvg?.querySelectorAll('path, rect') ?? [])]
            .slice(0, 20)
            .map((element) => ({
              className: element.getAttribute('class'),
              fill: element.getAttribute('fill'),
              box: (() => {
                const rect = element.getBoundingClientRect();
                return [rect.width, rect.height];
              })(),
            })),
        };
        const rect = bar.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      assert(position?.x != null, `${themeLabel(dark)} PulseIQ bar chart has no visible series mark to inspect: ${JSON.stringify(position)}`);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: position.x,
        y: position.y,
      });
      await waitFor(cdp, `(() => {
        const tooltip = document.querySelector('.recharts-tooltip-wrapper');
        return Boolean(tooltip && getComputedStyle(tooltip).visibility !== 'hidden' && tooltip.innerText.trim());
      })()`, `${themeLabel(dark)} PulseIQ chart tooltip`);
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
    }

    console.log(
      `  ${themeLabel(dark)} ${viewport.width}px ${mode.name}: ${state.axisCount} axis labels, ${state.legend.length} distinct series, themed grid${mode.tooltip ? ', readable tooltip' : ''}`,
    );
  }
  await captureThemeScreenshot(cdp, dark, 'pulseiq-specialty-charts');
}

async function openGisHeatmap(cdp) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before GIS heatmap checks');
  await clickVisible(cdp, 'Territory', true);
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

async function checkGisLegendAndRiskColors(cdp, dark, viewport) {
  await openGisHeatmap(cdp);
  await setTheme(cdp, dark);
  await clickButtonAndScroll(cdp, 'Station Vectors');
  await waitFor(cdp, `Boolean(document.querySelector('svg circle[fill]'))`, 'GIS station vector markers');

  const state = await evaluate(cdp, `(() => {
    const legend = [...document.querySelectorAll('.absolute.top-4.right-4 span')]
      .filter((element) => element.textContent.trim())
      .map((element) => ({
        text: element.textContent.trim(),
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
      }));
    const paletteLabels = ['Top 10%', '75th–90th percentile', '50th–75th percentile', 'Below national median rate', 'No paired OHCA / transport report'];
    const legendText = document.querySelector('.absolute.top-4.right-4')?.innerText ?? '';
    const colorFor = (label) => {
      const text = [...document.querySelectorAll('.absolute.top-4.right-4 span')]
        .find((element) => element.innerText.includes(label));
      const swatch = text?.parentElement?.querySelector('span.rounded-full');
      return swatch ? getComputedStyle(swatch).backgroundColor : '';
    };
    const riskColors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-sky-400', 'bg-slate-500']
      .map((className) => {
        const swatch = document.querySelector('.absolute.top-4.right-4 .' + CSS.escape(className));
        return swatch ? getComputedStyle(swatch).backgroundColor : '';
      });
    const markerColors = [...document.querySelectorAll('svg g.cursor-pointer.group[transform^="translate("] circle[fill]')]
      .map((circle) => circle.getAttribute('fill'))
      .filter((fill) => fill && fill !== 'none');
    return {
      legendVisible: Boolean(document.querySelector('.absolute.top-4.right-4')),
      legendText,
      paletteLabels,
      riskColors,
      markerColors: [...new Set(markerColors)],
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert(state.legendVisible, `${themeLabel(dark)} GIS risk legend is missing`);
  assert(state.paletteLabels.every((label) => state.legendText.includes(label)),
    `${themeLabel(dark)} GIS risk legend labels are incomplete: ${JSON.stringify(state.legendText)}`);
  const expectedRiskColors = [
    'oklch(0.645 0.246 16.439)',
    'oklch(0.705 0.213 47.604)',
    'oklch(0.828 0.189 84.429)',
    'oklch(0.746 0.16 232.661)',
    'oklch(0.554 0.046 257.417)',
  ];
  assert(state.riskColors.length === expectedRiskColors.length &&
    expectedRiskColors.every((color) => state.riskColors.includes(color)) &&
    new Set(state.riskColors).size === expectedRiskColors.length,
  `${themeLabel(dark)} GIS semantic risk colors changed or became indistinguishable: ${JSON.stringify(state.riskColors)}`);
  assert(state.markerColors.length > 0, `${themeLabel(dark)} GIS station risk colors are not rendered`);
  assert(!state.pageOverflow, `GIS heatmap overflows at ${viewport.width}px`);
  await checkReadable(cdp, `${themeLabel(dark)} GIS legend`, [
    { name: 'GIS legend heading', selector: '.absolute.top-4.right-4 .text-slate-200' },
    { name: 'GIS highest-risk legend label', selector: '.absolute.top-4.right-4 .text-slate-100' },
    { name: 'GIS supporting legend label', selector: '.absolute.top-4.right-4 .text-slate-300' },
    { name: 'GIS muted legend label', selector: '.absolute.top-4.right-4 .text-slate-400' },
  ]);

  const marker = await evaluate(cdp, `(() => {
    const legend = document.querySelector('.absolute.top-4.right-4')?.getBoundingClientRect();
    const candidates = [...document.querySelectorAll('svg g.cursor-pointer.group[transform^="translate("]')]
      .map((group) => ({
        group,
        circle: group.querySelector('circle[fill]:not([fill="none"])'),
        rect: group.querySelector('circle[fill]:not([fill="none"])')?.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect && rect.width > 2 && rect.height > 2 &&
        rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight);
    const target = candidates.find(({ rect }) => !legend ||
      rect.right < legend.left || rect.left > legend.right || rect.bottom < legend.top || rect.top > legend.bottom);
    if (!target) return null;
    const rect = target.rect;
    target.circle.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert(marker, `${themeLabel(dark)} GIS map has no visible station marker to inspect`);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: marker.x,
    y: marker.y,
  });
  await waitFor(cdp, `(() => {
    const tooltip = [...document.querySelectorAll('.absolute')]
      .find((element) => element.querySelector('h4') && element.innerText.includes('Annual OHCA'));
    return Boolean(tooltip && tooltip.innerText.trim());
  })()`, `${themeLabel(dark)} GIS station tooltip`);
  await checkReadable(cdp, `${themeLabel(dark)} GIS station tooltip`, [
    { name: 'GIS tooltip agency name', selector: '.absolute.bottom-12.left-4 h4.text-white' },
    { name: 'GIS tooltip supporting text', selector: '.absolute.bottom-12.left-4 .text-slate-400' },
  ]);
  console.log(
    `  ${themeLabel(dark)} ${viewport.width}px GIS risk legend: ${state.riskColors.length} distinct risk colors; ${state.markerColors.length} rendered marker colors; readable station tooltip`,
  );
}

async function runViewport(cdp, viewport) {
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

  await clickVisible(cdp, 'Territory', true);
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
    `Boolean(document.querySelector('.county-state-summary-panel')) &&
      Boolean(document.querySelector('.county-profile-card'))`,
    'Florida county summary cards',
  );
  await checkCounty(cdp, false);
  await checkCounty(cdp, true);
  await checkCounty(cdp, 'miami-vice');

  await openProfile(cdp);
  await checkProfileAndSources(cdp, false);
  await checkProfileAndSources(cdp, true);
  await checkProfileAndSources(cdp, 'miami-vice');

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
  console.log(`PASS ${viewport.width}×${viewport.height}: Home, Territory, Agencies, Field Work, profile, comparison, charts, and GIS in all themes`);
}

async function main() {
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
  try {
    const target = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((result) => result.json());
    const page = targets.find((candidate) => candidate.type === 'page');
    assert(page, 'Chromium did not create a page target');
    cdp = createCdpClient(page.webSocketDebuggerUrl ?? target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    for (const viewport of viewports) await runViewport(cdp, viewport);
    console.log('Theme readability checks passed at phone and laptop sizes.');
  } finally {
    cdp?.close();
    const chromiumClosed = new Promise((resolve) => chromium.once('close', resolve));
    try {
      process.kill(-chromium.pid, 'SIGTERM');
    } catch {
      // Chromium may already have exited.
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
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(`Theme readability check failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
