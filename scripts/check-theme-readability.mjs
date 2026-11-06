import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.THEME_TEST_URL ?? `http://127.0.0.1:${process.env.PORT ?? '24938'}/`;
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const viewports = [
  { width: 390, height: 844, mobile: true },
  { width: 1280, height: 900, mobile: false },
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
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
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

async function setTheme(cdp, dark) {
  await evaluate(cdp, `document.documentElement.classList.toggle('dark', ${dark})`);
  await waitFor(
    cdp,
    `document.documentElement.classList.contains('dark') === ${dark}`,
    `${dark ? 'dark' : 'light'} theme`,
  );
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
      const foreground = parse(getComputedStyle(element).color);
      let background = null;
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        const value = parse(getComputedStyle(current).backgroundColor);
        if (value && value.alpha > 0) {
          background = background ? { rgb: composite(value, background), alpha: 1 } : value;
          if (value.alpha === 1) break;
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
        text: element.innerText.trim().slice(0, 100),
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
      `${metricValue} map layer in ${dark ? 'dark' : 'light'} theme`,
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
    `Home selected/missing/control cues are incomplete in ${dark ? 'dark' : 'light'} theme: ${JSON.stringify(stateCue)}`,
  );
  if (!missingLayer) {
    console.log(`  ${dark ? 'dark' : 'light'} Home: no selected map layer currently has unavailable state data; missing fill definition and textual legend are present.`);
  } else {
    console.log(`  ${dark ? 'dark' : 'light'} Home: ${missingLayer.missingCount} missing states use the hatched fill on ${missingLayer.metricValue}.`);
  }
  await checkReadable(cdp, `${dark ? 'dark' : 'light'} Home`, [
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
  assert(summary.summaryText.length > 20, `${dark ? 'Dark' : 'Light'} county summary is empty`);
  assert(summary.cardTitle, `${dark ? 'Dark' : 'Light'} county card title is missing`);
  assert(summary.countyCount > 0, `${dark ? 'Dark' : 'Light'} county cards are missing`);
  await checkReadable(cdp, `${dark ? 'dark' : 'light'} county`, [
    { name: 'county card title', selector: '.county-profile-card h3' },
    { name: 'county summary heading', selector: '.county-state-summary-panel h4' },
  ]);
  console.log(
    `  ${dark ? 'dark' : 'light'} county state: ${summary.countyCount} cards; missing-data label ${summary.missingLabel || 'not present in first card'}`,
  );
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
  await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Agency operations summary"]'))`, 'provider summary cards');
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
  assert(profileCues.statusText, `${dark ? 'Dark' : 'Light'} profile status is missing`);
  assert(profileCues.statusHasAccessibleState, 'Profile review status is not announced accessibly');
  assert(profileCues.sourcePanel, 'Available source references panel is missing');
  assert(profileCues.sourceAction, 'Available source references action is missing');
  await checkReadable(cdp, `${dark ? 'dark' : 'light'} provider profile`, [
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
  await checkReadable(cdp, `${dark ? 'dark' : 'light'} source panel`, [
    { name: 'source drawer title', selector: '[aria-label="Evidence and Source Inspection Drawer"] h3' },
    { name: 'source match status', selector: '[aria-label="Evidence and Source Inspection Drawer"] .text-emerald-800' },
    { name: 'source explanation', selector: '[aria-label="Evidence and Source Inspection Drawer"] .text-emerald-900\\/80' },
  ]);
  console.log(`  ${dark ? 'dark' : 'light'} profile status: ${profileCues.statusText}; source status: ${sourceCues.statusText}`);
  await evaluate(cdp, `document.querySelector('[aria-label="Evidence and Source Inspection Drawer"] button')?.click()`);
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
  for (const agencyId of selectedIds) {
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
  }
  await clickVisible(cdp, '[data-testid="button-open-agency-comparison"]');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="agency-comparison-panel"]'))`, 'agency comparison panel');
  return selectedIds;
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
    `${dark ? 'Dark' : 'Light'} comparison selected-agency labels are missing or indistinguishable: ${JSON.stringify(cues.ranks)}`,
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

  await checkReadable(cdp, `${dark ? 'dark' : 'light'} agency comparison`, [
    { name: 'selected agency label', selector: '[data-testid^="comparison-agency-rank-"]' },
    { name: 'selected agency name', selector: '[data-testid^="button-open-profile-"] .font-display' },
    { name: 'reported comparison value', selector: '[data-value-status="reported"]' },
    { name: 'unavailable comparison value', selector: '[data-value-status="unavailable"]' },
    { name: 'source evidence note', selector: '[data-testid^="source-fact-"] p:last-child' },
  ]);
  console.log(
    `  ${dark ? 'dark' : 'light'} agency comparison: ${cues.ranks.join(', ')}; ${cues.selectedNames.map((name) => name.split('\n')[0]).join(' vs ')}; reported, unavailable, and source-note values present`,
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
  await checkHome(cdp, false);
  await checkHome(cdp, true);

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

  await openProfile(cdp);
  await checkProfileAndSources(cdp, false);
  await checkProfileAndSources(cdp, true);

  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(cdp, `Boolean(document.querySelector('.home-map-state-path'))`, 'Home before agency comparison checks');
  const selectedIds = await openAgencyComparison(cdp);
  await checkAgencyComparison(cdp, false, selectedIds);
  await checkAgencyComparison(cdp, true, selectedIds);
  console.log(`PASS ${viewport.width}×${viewport.height}: Home, counties, provider profile, source panel, and agency comparison in both themes`);
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
  console.error(`Theme readability check failed: ${error.message}`);
  process.exitCode = 1;
});
