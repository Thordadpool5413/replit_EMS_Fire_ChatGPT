import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl =
  process.env.TERRITORY_LINK_TEST_URL ??
  `http://127.0.0.1:${process.env.PORT ?? '24938'}/ems-territory-intelligence/`;
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const viewport = { width: 390, height: 844, mobile: true };
const pageErrors = [];

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
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
  return port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
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
    on(method, handler) {
      socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        if (message.method === method) handler(message.params);
      });
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
    throw new Error(
      details.exception?.description ?? details.exception?.value ?? details.text,
    );
  }
  return response.result.result.value;
}

async function waitFor(cdp, expression, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function linkUrl(search) {
  return new URL(search, baseUrl).toString();
}

async function assertGlobalProviderScope(cdp, provider) {
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[aria-label="Provider Discipline Filter"]'))`,
    'the global provider scope controls',
  );
  await waitFor(
    cdp,
    `(() => {
      const group = document.querySelector('[aria-label="Provider Discipline Filter"]');
      const button = [...(group?.querySelectorAll('button') ?? [])]
        .find((candidate) => candidate.innerText.trim().toLowerCase() === ${JSON.stringify(provider)});
      return Boolean(button?.classList.contains('bg-[#285EE8]'));
    })()`,
    `${provider} as the active global provider scope`,
  );
  const scope = await evaluate(cdp, `(() => {
    const group = document.querySelector('[aria-label="Provider Discipline Filter"]');
    const button = [...(group?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.innerText.trim().toLowerCase() === ${JSON.stringify(provider)});
    return {
      selected: Boolean(button?.classList.contains('bg-[#285EE8]')),
      buttons: [...(group?.querySelectorAll('button') ?? [])].map((candidate) => ({
        label: candidate.innerText.trim(),
        classes: candidate.className,
      })),
    };
  })()`);
  assert(scope.selected, `The global provider scope did not select ${provider}: ${JSON.stringify(scope.buttons)}`);
}

async function assertPhoneLayout(cdp, county) {
  const layout = await evaluate(cdp, `(() => {
    const main = document.querySelector('main');
    const state = document.querySelector('#breadcrumb-state-dropdown');
    const county = document.querySelector('#breadcrumb-county-dropdown');
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainRight: main?.getBoundingClientRect().right ?? Infinity,
      mainWidth: main?.getBoundingClientRect().width ?? 0,
      stateControl: visible(state),
      countyControl: visible(county),
      stateDetails: state ? {
        value: state.value,
        rect: state.getBoundingClientRect().toJSON(),
        display: getComputedStyle(state).display,
        visibility: getComputedStyle(state).visibility,
      } : null,
      countyDetails: county ? {
        value: county.value,
        rect: county.getBoundingClientRect().toJSON(),
        display: getComputedStyle(county).display,
        visibility: getComputedStyle(county).visibility,
      } : null,
      providerView: Boolean(document.querySelector('.territory-explorer-screen h2')?.innerText.includes('EMS & Fire Providers')),
    };
  })()`);
  assert(layout.viewport === viewport.width, `Expected a ${viewport.width}px viewport`);
  assert(
    layout.documentWidth <= viewport.width + 1 && layout.mainRight <= viewport.width + 1,
    `The selected territory overflows the phone viewport: ${JSON.stringify(layout)}`,
  );
  assert(layout.stateControl, `The state selector is unusable on phone: ${JSON.stringify(layout)}`);
  if (county) {
    assert(layout.countyControl, `The county selector is unusable on phone: ${JSON.stringify(layout)}`);
    assert(layout.providerView, `The county provider view did not render on phone: ${JSON.stringify(layout)}`);
  }
}

async function assertTerritoryLink(cdp, selection, search) {
  pageErrors.length = 0;
  await cdp.send('Page.navigate', { url: linkUrl(search) });
  await waitFor(
    cdp,
    selection.county
      ? `document.querySelector('#breadcrumb-county-dropdown')?.value === ${JSON.stringify(selection.county)}`
      : `document.querySelector('#breadcrumb-state-dropdown')?.value === ${JSON.stringify(selection.state)}`,
    `${selection.state}${selection.county ? ` / ${selection.county}` : ''} link selection`,
  );
  if (!selection.county) await assertGlobalProviderScope(cdp, selection.provider);

  if (selection.county) {
    const selectedCountyScope = await evaluate(cdp, `(() => {
      const screen = document.querySelector('.territory-explorer-screen');
      const button = [...(screen?.querySelectorAll('button') ?? [])]
        .find((candidate) => candidate.innerText.trim().startsWith(${JSON.stringify(`${selection.provider === 'ems' ? 'EMS' : 'Fire'} (`)}));
      return Boolean(button?.classList.contains('bg-white'));
    })()`);
    assert(
      selectedCountyScope,
      `The county provider filter did not select ${selection.provider}`,
    );
  }

  await assertPhoneLayout(cdp, selection.county);
  assert(pageErrors.length === 0, `Page error opening the link: ${pageErrors.join('; ')}`);

  pageErrors.length = 0;
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(
    cdp,
    selection.county
      ? `document.querySelector('#breadcrumb-county-dropdown')?.value === ${JSON.stringify(selection.county)}`
      : `document.querySelector('#breadcrumb-state-dropdown')?.value === ${JSON.stringify(selection.state)}`,
    `${selection.state}${selection.county ? ` / ${selection.county}` : ''} selection after refresh`,
  );
  if (!selection.county) await assertGlobalProviderScope(cdp, selection.provider);
  else {
    await waitFor(
      cdp,
      `(() => {
        const screen = document.querySelector('.territory-explorer-screen');
        const button = [...(screen?.querySelectorAll('button') ?? [])]
          .find((candidate) => candidate.innerText.trim().startsWith(${JSON.stringify(`${selection.provider === 'ems' ? 'EMS' : 'Fire'} (`)}));
        return Boolean(button?.classList.contains('bg-white'));
      })()`,
      `${selection.provider} provider scope after refresh`,
    );
  }
  await assertPhoneLayout(cdp, selection.county);
  assert(pageErrors.length === 0, `Page error refreshing the link: ${pageErrors.join('; ')}`);
  console.log(`✓ ${selection.state}${selection.county ? ` / ${selection.county}` : ''} / ${selection.provider} survives refresh at 390px`);
}

async function assertInvalidLinkFallsBack(cdp, search, provider) {
  pageErrors.length = 0;
  await cdp.send('Page.navigate', { url: linkUrl(search) });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('section[aria-label="Interactive U.S. Territory Map"]'))`,
    'the national map after an invalid territory link',
  );
  await waitFor(
    cdp,
    `!new URLSearchParams(location.search).has('state') &&
      !new URLSearchParams(location.search).has('county')`,
    'invalid territory values to be removed from the URL',
  );
  assert(pageErrors.length === 0, `Page error opening an invalid link: ${pageErrors.join('; ')}`);
  console.log(`✓ invalid link falls back to the national map (${provider} scope) without a page error`);
}

async function main() {
  const response = await fetch(baseUrl);
  assert(
    response.ok,
    `Could not load ${baseUrl} (HTTP ${response.status}). Start the EMS Territory Intelligence web workflow first.`,
  );

  const debuggingPort = await reservePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ems-territory-links-'));
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
    cdp.send('Runtime.exceptionThrown', {}).catch(() => {});
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails;
      pageErrors.push(details.exception?.description ?? details.text);
    });

    await assertTerritoryLink(cdp, {
      state: 'FL',
      county: null,
      provider: 'fire',
    }, '?state=FL&provider=fire');
    await assertTerritoryLink(cdp, {
      state: 'FL',
      county: 'Miami-Dade County',
      provider: 'ems',
    }, '?state=FL&county=Miami-Dade%20County&provider=ems');
    await assertInvalidLinkFallsBack(cdp, '?state=XX&provider=ems', 'ems');
    await assertInvalidLinkFallsBack(cdp, '?state=FL&county=Old-County&provider=fire', 'fire');
    console.log('Shared territory link browser checks passed.');
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
    await rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Shared territory link browser check failed: ${error.message}`);
  process.exitCode = 1;
});
