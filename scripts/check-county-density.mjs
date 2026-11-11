import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const phase = process.env.COUNTY_DENSITY_PHASE || 'after';
const out = `generated-artifacts/county-density-${phase}`;
await mkdir(out, { recursive: true });
const dir = await mkdtemp(path.join(os.tmpdir(), 'county-density-'));
const port = await reservePort();
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
const results = [];
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  cdp = createCdpClient(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await cdp.connect(); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  for (const width of [1366, 390, 320]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: new URL('/?state=FL', process.env.COUNTY_TEST_URL || 'http://127.0.0.1:80/').href });
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="text-fema-nri-score-12001"]'))`, 'county facts', 60000);
    await evaluate(cdp, `document.fonts.ready.then(()=>true)`);
    const result = await evaluate(cdp, `(()=>{
      const cards=[...document.querySelectorAll('.county-brief')], preview=document.querySelector('.county-inspector-panel.ci');
      const measure=e=>({id:e.getAttribute('data-testid')||'preview',height:e.getBoundingClientRect().height,width:e.clientWidth,scroll:e.scrollWidth,text:e.innerText.replace(/\\s+/g,' ').trim()});
      return {width:${width},client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,cards:cards.map(measure),preview:preview?measure(preview):null,inspectHeight:cards[0].querySelector('.cb-inspect').getBoundingClientRect().height,
        clipped:[...document.querySelectorAll('.county-brief *')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,parent:e.parentElement.className})).slice(0,8)}
    })()`);
    assert.ok(result.scroll <= result.client + 1, `Page overflow at ${width}`);
    assert.ok(result.cards.length >= 2, 'County cards rendered');
    assert.deepEqual(result.clipped, [], `County content overflow at ${width}`);
    if (width < 768) assert.ok(result.inspectHeight >= 44, 'Keep phone Inspect target');
    results.push(result);
    for (const [label, selector] of [['directory', '.county-brief'], ['preview', '.county-inspector-panel.ci']]) {
      await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start',behavior:'instant'})`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${out}/${width}-${label}.png`, Buffer.from(shot.result.data, 'base64'));
    }
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  if (phase === 'after') {
    const before = JSON.parse(await readFile('generated-artifacts/county-density-before/results.json', 'utf8'));
    for (const a of results) {
      const b = before.find(b => b.width === a.width);
      for (const card of a.cards) {
        const old = b.cards.find(c => c.id === card.id);
        assert.equal(card.text.replace(/\s/g, ''), old.text.replace(/\s/g, ''), `${card.id}: retain all information`);
        assert.ok(card.height <= old.height + 1, `${card.id}: must not grow`);
      }
      const reduction = Math.round(100 * (1 - a.cards[0].height / b.cards[0].height));
      assert.ok(reduction >= 10, `${a.width}: meaningful card reduction required`);
      if (a.preview && b.preview) {
        assert.equal(a.preview.text, b.preview.text, 'Keep preview facts');
        assert.ok(a.preview.height < b.preview.height, 'Preview must shrink');
      }
      console.log(`${a.width}: first card ${Math.round(b.cards[0].height)} -> ${Math.round(a.cards[0].height)}px (${reduction}% shorter); preview ${Math.round(b.preview?.height)} -> ${Math.round(a.preview?.height)}px; ${a.cards.length} cards preserve facts`);
    }
  }
  console.log(`PASS county density ${phase}: laptop, 390px and 320px; no clipped content.`);
} finally {
  cdp?.close(); chrome.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 150)); await rm(dir, { recursive: true, force: true });
}
