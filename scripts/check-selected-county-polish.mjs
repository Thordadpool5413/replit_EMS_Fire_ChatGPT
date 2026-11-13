// Read-only presentation checks through the artifact proxy.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const out = 'generated-artifacts/selected-county-polish';
await mkdir(out, { recursive: true });
const dir = await mkdtemp(path.join(os.tmpdir(), 'selected-county-'));
const port = await reservePort();
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  cdp = createCdpClient(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  for (const width of [1366, 390, 320]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: new URL('/?state=FL&county=Alachua%20County', process.env.COUNTY_TEST_URL || 'http://127.0.0.1:80/').href });
    await waitFor(cdp, `Boolean(document.querySelector('.county-city-directory-panel .cv-place-row'))`, 'county places', 60000);
    await evaluate(cdp, 'document.fonts.ready.then(()=>true)');
    const info = await evaluate(cdp, `(()=>{
      const panel=document.querySelector('.county-city-directory-panel');
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,
        places:panel.querySelectorAll('.cv-place-row').length,
        icons:panel.querySelectorAll('svg').length,
        map:document.querySelectorAll('.county-single-map-panel svg [role="button"]').length,
        stale:/No source mapped|No source details attached/i.test(document.querySelector('main').innerText)};
    })()`);
    assert(!info.overflow, `${width}: no page overflow`);
    assert(info.places > 0 && info.map > 0, 'Place list and interactive map retained');
    assert(info.icons >= info.places, 'Meaningful place icons');
    assert(!info.stale, 'Absent-source notices removed');
    for (const [name, selector] of [['county', '.county-single-map-panel'], ['providers', '.agency-directory-card']]) {
      if (name === 'providers') {
        await evaluate(cdp, `document.querySelector('[data-testid="button-provider-view-cards"]')?.click()`);
        await waitFor(cdp, `Boolean(document.querySelector('.agency-directory-card'))`, 'provider cards', 15000);
      }
      await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${out}/${width}-${name}.png`, Buffer.from(shot.result.data, 'base64'));
    }
    if (width >= 768) {
      await evaluate(cdp, `document.querySelector('[data-testid="button-provider-view-table"]').click()`);
      await waitFor(cdp, `Boolean(document.querySelector('[aria-label="Agency comparison table, scrolls horizontally"] table'))`, 'provider table', 10000);
    }
    await evaluate(cdp, `document.querySelector('.county-city-directory-panel .cv-place-row').click()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="button-show-all-places"]'))`, 'place selection', 10000);
    await evaluate(cdp, `document.querySelector('[data-testid="button-show-all-places"]').click()`);
    await waitFor(cdp, `!document.querySelector('[data-testid="button-show-all-places"]')`, 'clear place selection', 10000);
    console.log(`PASS ${width}: county map, places, providers, selection and return`);
  }
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
