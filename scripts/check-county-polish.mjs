// Focused layout/interaction checks. Uses the artifact proxy, not Vite's API-less direct port.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.COUNTY_TEST_URL ?? 'http://127.0.0.1:80/';
const captures = process.env.COUNTY_CAPTURE_DIR ?? '/tmp/ems-county-polish-checks';
const profile = await mkdtemp(path.join(os.tmpdir(), 'ems-county-browser-'));
await mkdir(captures, { recursive: true });
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const chrome = spawn(process.env.CHROMIUM_PATH ?? 'chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}/browser`, 'about:blank',
], {
  stdio: 'ignore',
  env: { ...process.env, HOME: profile, XDG_CONFIG_HOME: `${profile}/config`, XDG_CACHE_HOME: `${profile}/cache`, XDG_DATA_HOME: `${profile}/data` },
});
let socket;
const requests = new Map();
let id = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { requests.delete(current); reject(new Error(`${method} timed out`)); }, 30_000);
    requests.set(current, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert(!response.exceptionDetails, response.exceptionDetails?.exception?.description ?? 'Browser evaluation failed');
  return response.result.value;
}
async function waitFor(expression, label, timeout = 60_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await pause(150);
  }
  throw new Error(`Timed out: ${label}. ${await evaluate('document.body.innerText.slice(-600)')}`);
}
async function navigate(query, ready) {
  await send('Page.navigate', { url: new URL(query, baseUrl).href });
  await waitFor(ready, query);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function capture(name, selector) {
  if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start',behavior:'instant'})`);
  else await evaluate('scrollTo({top:0,behavior:"instant"})');
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(captures, `${name}.png`), Buffer.from(shot.data, 'base64'));
}
async function layout(label, desktop) {
  const result = await evaluate(`(() => {
    const nav = document.querySelector('.pi-primary-nav');
    const sidebar = document.querySelector('.pi-primary-sidebar');
    const logo = sidebar?.querySelector('.pi-sidebar-logo');
    const image = logo?.querySelector('img');
    const tools = [...(nav?.querySelectorAll('button') ?? [])].filter(button =>
      /Specialist tools|Data & system/.test(button.innerText));
    return {
      width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      clippedCountyContent: [...document.querySelectorAll('.county-signal-row,.county-figure-source-details')]
        .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className),
      navHeight: nav?.clientHeight, navScrollHeight: nav?.scrollHeight,
      sidebarHeight: sidebar?.clientHeight, sidebarScrollHeight: sidebar?.scrollHeight,
      tools: tools.map(button => {
        const text = [...button.querySelectorAll('span')].find(span => /Specialist tools|Data & system/.test(span.innerText));
        return {label:button.innerText.trim(),width:text?.clientWidth,scrollWidth:text?.scrollWidth};
      }),
      rows: [...(sidebar?.querySelectorAll('.pi-sb-item,.pi-sb-tool') ?? [])].map(row => {
        const rect = row.getBoundingClientRect(), icon = row.querySelector('svg')?.getBoundingClientRect();
        return {left:rect.left,width:rect.width,height:rect.height,iconX:icon?.left,iconWidth:icon?.width};
      }),
      logo: logo ? {width:logo.getBoundingClientRect().width,rootSize:parseFloat(getComputedStyle(document.documentElement).fontSize),
        src:image?.currentSrc,fit:image && getComputedStyle(image).objectFit} : null,
    };
  })()`);
  assert(result.documentWidth <= result.width + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.clippedCountyContent, [], `${label}: internally clipped county content`);
  if (desktop) {
    assert(result.navScrollHeight <= result.navHeight + 1, `${label}: unnecessary nav scroll ${JSON.stringify(result)}`);
    assert(result.sidebarScrollHeight <= result.sidebarHeight + 1, `${label}: unnecessary sidebar scroll ${JSON.stringify(result)}`);
    assert.equal(result.tools.length, 2, `${label}: missing tool destinations`);
    assert(result.tools.every(tool => tool.scrollWidth <= tool.width + 1), `${label}: truncated tools ${JSON.stringify(result.tools)}`);
    assert(Math.abs(result.logo.width - result.logo.rootSize * 8.5) < .2, `${label}: logo size changed`);
    assert(result.logo.src.includes('nicks_ems_logo_1792367124466.jpg') && result.logo.fit === 'cover', `${label}: logo asset/crop changed`);
    const first = result.rows[0];
    assert(result.rows.every(row => Math.abs(row.left-first.left)<1 && Math.abs(row.width-first.width)<1 &&
      Math.abs(row.height-first.height)<1 && Math.abs(row.iconX-first.iconX)<1 && Math.abs(row.iconWidth-first.iconWidth)<1),
    `${label}: uneven sidebar row or icon alignment ${JSON.stringify(result.rows)}`);
    if (label.endsWith(' Home')) {
      await evaluate('document.querySelector(\'.pi-primary-sidebar button[aria-label="Help and sources"]\').click()');
      await waitFor('Boolean(document.querySelector(".pi-sb-utility-menu"))', 'Help and sources menu');
      const bounds = await evaluate(`(() => {
        const menu = document.querySelector('.pi-sb-utility-menu'), rect = menu.getBoundingClientRect();
        const sidebar = document.querySelector('.pi-primary-sidebar').getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,limit:sidebar.right,overflow:menu.scrollWidth>menu.clientWidth+1};
      })()`);
      assert(bounds.left >= 0 && bounds.right <= bounds.limit && bounds.top >= 0 && !bounds.overflow,
        `Help menu is clipped: ${JSON.stringify(bounds)}`);
      await evaluate('document.querySelector(\'.pi-primary-sidebar button[aria-label="Help and sources"]\').click()');
    }
  }
}
async function framing(label, single = false) {
  const result = await evaluate(`(() => {
    const svg = document.querySelector(${JSON.stringify(single ? '.county-municipality-map-panel svg' : '.county-state-map-svg')});
    const group = svg?.querySelector('g');
    if (!svg || !group) return null;
    const b = group.getBBox(), m = group.getScreenCTM(), rect = svg.getBoundingClientRect();
    const corners = [[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([x,y]) => new DOMPoint(x,y).matrixTransform(m));
    return {width:rect.width,height:rect.height,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
      x:corners[0].x,y:corners[0].y,r:corners[1].x,b:corners[1].y,
      fit:Math.max((corners[1].x-corners[0].x)/rect.width,(corners[1].y-corners[0].y)/rect.height)};
  })()`);
  assert(result && result.width > 0 && result.height > 0, `${label}: map absent`);
  assert(result.fit >= .72, `${label}: map uses too little of its viewport ${JSON.stringify(result)}`);
  assert(result.x >= result.left - 3 && result.r <= result.right + 3 && result.y >= result.top - 3 && result.b <= result.bottom + 3,
    `${label}: geometry cropped ${JSON.stringify(result)}`);
  console.log(`✓ ${label}: proportional map fit ${(result.fit * 100).toFixed(0)}%`);
}
async function pressEnter() {
  // Native buttons activate on the character event; rawKeyDown alone only
  // exercises custom SVG keydown handlers, not a real Enter keystroke.
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
      ...(type === 'char' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  }
}

try {
  let targets;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); break; } catch { await pause(100); }
  }
  assert(targets, 'Chromium did not start');
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const pending = requests.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    requests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const viewports = [{ width: 1024, height: 640 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]
    .filter(viewport => !process.env.COUNTY_TEST_WIDTH || viewport.width === Number(process.env.COUNTY_TEST_WIDTH));
  const mapOnly = process.env.COUNTY_MAP_ONLY === '1';
  const cardsOnly = process.env.COUNTY_CARDS_ONLY === '1';
  for (const viewport of viewports) {
    const desktop = viewport.width >= 768;
    const label = `${viewport.width}x${viewport.height}`;
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: !desktop });
    if (mapOnly) {
      await navigate('/?state=FL&county=Alachua%20County', 'Boolean(document.querySelector(".county-city-directory-panel"))');
      await framing(`${label} Alachua`, true);
      await layout(`${label} Home`, desktop);
      const labelSize = await evaluate(`(() => {
        const text = document.querySelector('.cv-pin-label');
        return parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a;
      })()`);
      assert(labelSize >= 11.5, `${label}: unreadable map label size ${labelSize}`);
      await capture(`${label}-county`, '.county-municipality-map-panel');
      console.log(`✓ ${label}: readable map labels and unclipped Help menu`);
      continue;
    }
    if (!cardsOnly) {
    await navigate('/', 'Boolean(document.querySelector(".home-map-state-path"))');
    await evaluate(`(() => {
      const theme = document.querySelector('[data-testid="theme-select-desktop"]');
      theme.value = 'daylight'; theme.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await layout(`${label} Home`, desktop);
    await capture(`${label}-home`);
    }
    await navigate('/?state=FL', 'Boolean(document.querySelector(\'[data-testid="row-county-signals-12001"]\'))');
    await waitFor('document.querySelector(\'[data-testid="text-fema-nri-rating-12001"]\')?.textContent.includes("Moderate")', 'Florida source-defined FEMA rating');
    await layout(`${label} Florida`, desktop);
    if (!cardsOnly) {
    await waitFor('Boolean(document.querySelector(\'.county-state-map-svg path\'))', 'Florida boundaries');
    await framing(`${label} Florida`);
    await capture(`${label}-state`);
    }
    const row = await evaluate(`(() => {
      const card = document.querySelector('[data-testid="row-county-signals-12001"]');
      const text = card.innerText;
      const placeButtons = [...card.querySelectorAll('.county-profile-city-list button')];
      const sources = card.querySelector('.county-figure-source-details');
      return {text, closedDetails:card.querySelectorAll('details:not([open])').length,
        placeNames:placeButtons.map(button=>button.innerText.trim()),sourceText:sources?.innerText ?? '',
        titleSize:parseFloat(getComputedStyle(card.querySelector('h3')).fontSize),
        titleHeight:card.querySelector('h3').getBoundingClientRect().height,
        titleLineHeight:parseFloat(getComputedStyle(card.querySelector('h3')).lineHeight),
        titleFont:getComputedStyle(card.querySelector('h3')).fontFamily};
    })()`);
    assert(!/User review not recorded|End-user review/i.test(row.text), 'Review-status clutter remains');
    assert.equal(row.closedDetails, 0, `${label}: county details or sources hidden`);
    assert.equal(row.placeNames.filter(name => name.toLowerCase() === 'high springs').length, 1, 'Duplicate High Springs');
    assert(row.text.includes('82.354°W') && !row.text.includes('-82.354°W'), 'Incorrect coordinate sign/direction');
    assert(row.sourceText.includes('Source') || row.sourceText.includes('source'), 'Missing inline coverage');
    assert(row.titleSize >= 14 && !/mono/i.test(row.titleFont), 'County titles too small or monospaced');
    await capture(`${label}-directory`, '[data-testid="row-county-signals-12001"]');
    if (cardsOnly) {
      assert(row.titleHeight <= row.titleLineHeight * 1.2, `${label}: county name squeezed into multiple lines`);
      assert(!/data standard|does not establish/.test(row.text), 'Repeated general explanation still inside county card');
      for (const value of ['184,943', '18.3', '318', '15,165', '24.3', '73,943', '18.3', '16.1', '32618', '32615']) {
        assert(row.text.includes(value), `${label}: missing reference value ${value}`);
      }
      for (const theme of ['daylight', 'dark', 'miami-vice']) {
        await evaluate(`(() => {
          const select = document.querySelector('[data-testid="theme-select-desktop"]');
          select.value = ${JSON.stringify(theme)};
          select.dispatchEvent(new Event('change', {bubbles:true}));
        })()`);
        await pause(200);
        await layout(`${label} ${theme} county`, desktop);
        await capture(`${label}-directory-${theme}`, '[data-testid="row-county-signals-12001"]');
      }
      if (viewport.width === 1366) {
        await evaluate('document.querySelector(\'[data-testid="button-inspect-county-12001"]\').click()');
        await waitFor('Boolean(document.querySelector(".county-city-directory-panel"))', 'Inspect county action');
        await evaluate('history.back()');
        await waitFor('Boolean(document.querySelector(\'[data-testid="row-county-signals-12001"]\'))', 'county directory after Back');
      }
      await evaluate('document.querySelector(\'[data-testid="row-county-signals-12001"] .county-profile-city-list button\').focus()');
      await pressEnter();
      await waitFor('Boolean(document.querySelector(\'[data-testid="button-show-all-places"]\'))', 'place link keyboard activation');
      console.log(`✓ ${label}: all eight figures, visible sources, all ZIPs, three themes and working place link`);
      continue;
    }
    await navigate('/?state=FL&county=Alachua%20County', 'Boolean(document.querySelector(".county-city-directory-panel"))');
    await layout(`${label} Alachua`, desktop);
    await framing(`${label} Alachua`, true);
    await capture(`${label}-county`, '.county-municipality-map-panel');
    const marker = await evaluate(`(() => {
      const marker = document.querySelector('.county-municipality-map-panel svg [role="button"]');
      marker?.scrollIntoView({block:'center',behavior:'instant'}); marker?.focus();
      return Boolean(marker && document.activeElement === marker);
    })()`);
    assert(marker, 'City map marker cannot receive keyboard focus');
    await pressEnter();
    await waitFor('Boolean(document.querySelector(\'[data-testid="button-show-all-places"]\'))', 'keyboard city selection');
    const clearCity = await evaluate(`(() => {
      const panel = document.querySelector('.county-city-directory-panel');
      const button = [...(panel?.querySelectorAll('button') ?? [])].find(button => /Show all/.test(button.innerText));
      button?.click(); return Boolean(button);
    })()`);
    assert(clearCity, 'Return to all cities action missing');
    await waitFor('!document.querySelector(\'[data-testid="button-show-all-places"]\') && !document.querySelector(\'.county-city-directory-panel [aria-pressed="true"]\')', 'return to all cities');
    console.log(`✓ ${label}: Home/state/county, inline sources, deduped places, keyboard city selection and return`);
  }
  if (!mapOnly) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  if (!cardsOnly) for (const [code, name] of [['TX', 'Texas'], ['RI', 'Rhode Island'], ['AK', 'Alaska']]) {
    await navigate(`/?state=${code}`, 'Boolean(document.querySelector(".county-state-map-svg path"))');
    await framing(name);
    await capture(`1366x768-${code}`);
  }
  await navigate('/?state=FL', 'Boolean(document.querySelector(\'[data-testid="row-county-signals-12001"]\'))');
  const pagination = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.county-signal-row')];
    const next = [...document.querySelectorAll('button')].find(button =>
      !button.disabled && /Next/.test(button.getAttribute('aria-label') ?? button.innerText));
    if (!next) return null;
    const above = next.getBoundingClientRect().top < rows[0].getBoundingClientRect().top;
    next.click(); return {above};
  })()`);
  assert(pagination?.above, 'County pagination unavailable above list');
  await waitFor('document.querySelectorAll(".county-signal-row").length === 7', 'remaining seven Florida counties');
  assert.equal(await evaluate('document.querySelectorAll(".county-signal-row").length'), 7);
  console.log('✓ Florida pagination: remaining seven counties reachable from directory heading');
  }
  assert.deepEqual(errors, [], `Uncaught browser exceptions: ${errors.join(', ')}`);
  console.log(`PASS county polish checks. Captures: ${captures}`);
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await new Promise(resolve => chrome.once('exit', resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    .catch(error => console.warn(`Temporary browser profile cleanup: ${error.message}`));
}
