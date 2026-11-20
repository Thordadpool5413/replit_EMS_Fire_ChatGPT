// Focused layout/interaction checks. Uses the artifact proxy, not Vite's API-less direct port.
// High contrast only: COUNTY_FORCED_COLORS_ONLY=1 node scripts/check-county-polish.mjs
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
// Readable content determines height. Report geometry rather than enforcing
// the retired 360px cap that encouraged tiny labels and cramped source rows.
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
  if (desktop && process.env.COUNTY_CARDS_ONLY !== '1') {
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
  assert(result && result.width > 0 && result.height > 0, `${label}: map absent ${JSON.stringify(result)}`);
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

// Windows High Contrast is exposed to web content as forced-colors. Test both
// system palettes, not the authored FEMA/icon hues (which may legitimately vanish).
async function checkForcedSurface(selector, label) {
  const result = await evaluate(`(() => {
    const root=document.querySelector(${JSON.stringify(selector)});
    const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility==='visible';
    const probe=document.createElement('span');
    probe.style.cssText='color:CanvasText;background:Canvas;position:absolute';
    root.append(probe);
    const system={ink:getComputedStyle(probe).color,paper:getComputedStyle(probe).backgroundColor};
    probe.remove();
    // The snapshot heading is an intentional screen-reader-only section name,
    // not a county detail. Its metric labels remain visible and are checked.
    const items=[...root.querySelectorAll('dt,dd,h3,h4,h5,p,a,button,.cb-risk-chip,.ci-risk-rating,.cb-risk-meta,.ci-fema-row')]
      .filter(e=>!e.matches('.cb-group--snapshot > .cb-group-cap'));
    const links=[...root.querySelectorAll('a,.cb-place,.ci-place-name')];
    const swatch=root.querySelector('.ci-swatch') ?? root.querySelector('.cb-risk-chip');
    const swatchStyle=swatch && getComputedStyle(swatch,swatch.matches('.cb-risk-chip')?'::before':null);
    return {active:matchMedia('(forced-colors: active)').matches,system,text:root.innerText,
      facts:[...root.querySelectorAll('dt,dd')].map(e=>e.innerText),
      hidden:items.filter(e=>!visible(e)).map(e=>e.className),
      clipped:items.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className),
      closed:root.querySelectorAll('details:not([open])').length,
      labels:[...root.querySelectorAll('.cb-group--snapshot dt,.ci-stats dt,.cb-risk-chip,.ci-risk-rating')]
        .map(e=>({text:e.innerText,color:getComputedStyle(e).color})),
      links:links.map(e=>{const s=getComputedStyle(e);return {text:e.innerText,
        underline:s.textDecorationLine.includes('underline'),color:s.color,decoration:s.textDecorationColor};}),
      actions:[...root.querySelectorAll('.cb-inspect,.ci-btn')].map(e=>{
        const s=getComputedStyle(e);return {border:parseFloat(s.borderTopWidth),style:s.borderTopStyle,
          ink:s.color,borderColor:s.borderTopColor,background:s.backgroundColor};}),
      swatch:swatchStyle && {border:parseFloat(swatchStyle.borderTopWidth),style:swatchStyle.borderTopStyle,
        color:swatchStyle.borderTopColor},
      controls:root.querySelectorAll('button,a').length,
      overrides:[root,...root.querySelectorAll('*')].some(e=>getComputedStyle(e).forcedColorAdjust==='none')};
  })()`);
  assert(result.active,`${label}: forced-colors emulation inactive`);
  assert.notEqual(result.system.ink,result.system.paper,`${label}: invalid high-contrast palette`);
  assert(!result.overrides,`${label}: county content opts out of system colors`);
  assert.deepEqual(result.hidden,[],`${label}: hidden county details`);
  assert.deepEqual(result.clipped,[],`${label}: clipped county details`);
  assert.equal(result.closed,0,`${label}: collapsed county details`);
  assert(result.labels.every(item=>item.text.trim() && item.color===result.system.ink),
    `${label}: primary labels or textual FEMA category lost system contrast`);
  assert(result.links.length>0 && result.links.every(link=>link.underline && link.color===link.decoration),
    `${label}: source/place links need a visible non-color cue ${JSON.stringify(result.links)}`);
  assert(result.actions.every(a=>a.border>=1 && a.style==='solid' && a.borderColor!==a.background && a.ink!==a.background),
    `${label}: action boundary lost ${JSON.stringify(result.actions)}`);
  assert(result.swatch?.border>=1 && result.swatch.style==='solid' && result.swatch.color!==result.system.paper,
    `${label}: FEMA swatch boundary disappears`);
  // A real Tab event establishes keyboard modality; programmatic focus alone
  // can inherit mouse modality and miss :focus-visible regressions.
  for (let index=0;index<result.controls;index++) {
    await evaluate(`(() => {
      const target=document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button,a')[${index}];
      const start=document.createElement('span');start.tabIndex=0;start.id='county-tab-start';
      target.before(start);start.focus();
    })()`);
    for (const type of ['rawKeyDown','keyUp'])
      await send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focus=await evaluate(`(() => {
      document.querySelector('#county-tab-start').remove();
      const target=document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button,a')[${index}];
      const s=getComputedStyle(target);
      return {active:document.activeElement===target,visible:target.matches(':focus-visible'),
        width:parseFloat(s.outlineWidth),style:s.outlineStyle,color:s.outlineColor,offset:parseFloat(s.outlineOffset)};
    })()`);
    assert(focus.active && focus.visible && focus.width>=2 && focus.style==='solid' &&
      focus.color!==result.system.paper && focus.offset>=2,
      `${label}: keyboard focus lost on control ${index} ${JSON.stringify(focus)}`);
  }
  await capture(label,selector);
  return result;
}

async function checkForcedColors(viewport) {
  const label=`${viewport.width}x${viewport.height}`;
  await navigate('/?state=FL','Boolean(document.querySelector(".county-inspector-panel"))');
  await waitFor('document.querySelector(".ci-risk-rating")?.innerText.includes("Relatively Moderate")','FEMA forced-colors source record');
  const surfaces=['.county-inspector-panel','[data-testid="row-county-signals-12001"]'];
  const baseline=await evaluate(`JSON.stringify(${JSON.stringify(surfaces)}.map(selector=>{
    const root=document.querySelector(selector);
    return {text:root.innerText,facts:[...root.querySelectorAll('dt,dd')].map(e=>e.innerText)};
  }))`);
  try {
    for (const scheme of ['light','dark']) {
      await send('Emulation.setEmulatedMedia',{features:[
        {name:'forced-colors',value:'active'},{name:'prefers-color-scheme',value:scheme}]});
      for (const theme of ['daylight','dark','miami-vice']) {
        await evaluate(`(() => {
          const select=document.querySelector('[data-testid="theme-select-desktop"]');
          select.value=${JSON.stringify(theme)};select.dispatchEvent(new Event('change',{bubbles:true}));
        })()`);
        await pause(150);
        const readings=[];
        for (const [index,selector] of surfaces.entries()) {
          const result=await checkForcedSurface(selector,`${label}-forced-${scheme}-${theme}-${index?'directory':'preview'}`);
          readings.push({text:result.text,facts:result.facts});
          for (const text of ['Population','Avg EMS transport','Cardiac arrests','Relatively Moderate','December 2025'])
            assert(result.text.includes(text),`${label}: forced colors lost ${text}`);
        }
        assert.equal(JSON.stringify(readings),baseline,`${label}: high contrast changes county details or source-defined ratings`);
      }
      // Dense fixture includes missing versus zero and all eight attached sources.
      await checkDenseFixture(viewport,scheme);
    }
  } finally {
    await send('Emulation.setEmulatedMedia',{features:[]});
  }
  console.log(`✓ ${label}: both forced-color palettes, three themes, native labels, links, actions and keyboard focus`);
}

async function checkDenseFixture(viewport, forcedScheme) {
  const label = `${viewport.width}x${viewport.height}`;
  await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 768 });
  await navigate('/?state=FL', 'Boolean(document.querySelector(".county-signal-list"))');
  await evaluate(`(async () => {
    // Reuse Vite's exact optimized React URLs, avoiding a second React instance.
    const entry = await fetch('/src/main.tsx').then(r => r.text());
    const reactUrl = entry.match(/from\\s+["']([^"']*\\/react_jsx-dev-runtime\\.js[^"']*)["']/)?.[1]?.replace('react_jsx-dev-runtime.js','react.js');
    const domUrl = entry.match(/from\\s+["']([^"']*react-dom_client[^"']*)["']/)?.[1];
    if (!reactUrl || !domUrl) throw new Error('Cannot locate optimized React fixture imports');
    const [{ default: React }, { default: ReactDOM }, { CountyDirectoryCard }, { NATIONAL_COUNTIES_DIRECTORY }] =
      await Promise.all([import(reactUrl), import(domUrl),
        import('/src/components/CountyDirectoryCard.tsx'), import('/src/data/nationalGeographicData.ts')]);
    const county = { ...NATIONAL_COUNTIES_DIRECTORY.find(c => c.countyFips === '12001'),
      countyName: 'Long County Equivalent and Consolidated Municipality',
      countySeat: 'A long county seat and administrative district',
      population: 0, averageTransportMinutes: null, annualCardiacArrestIncidents: 0,
      annualEmergencyTransports: 0, seniorPopPct: 0, medianIncome: 0, povertyRatePct: null,
      primaryCathLabDistanceMiles: 0,
      primaryZipCodes: Array.from({length: 24}, (_, i) => String(32000 + i)),
      cities: Array.from({length: 12}, (_, i) => 'Long mapped municipality ' + (i + 1)),
    };
    const keys = ['population','averageTransportMinutes','annualCardiacArrestIncidents',
      'annualEmergencyTransports','seniorPopPct','medianIncome','povertyRatePct','primaryCathLabDistanceMiles'];
    county.figureSources = Object.fromEntries(keys.map(key => [key, {
      source: 'Official county reference — extended source name for ' + key,
      sourceUrl: 'https://example.org/' + 'long-source-path/'.repeat(8) + key,
      vintage: 'December 2025 release', scope: 'County-equivalent reporting geography, not individual agency service area',
      reportingPeriod: 'January–December 2024 reporting period'
    }]));
    const host = document.createElement('div');
    host.id = 'county-regression-fixture';
    host.className = 'county-signal-list';
    document.querySelector('.county-signal-list').after(host);
    window.__countyFixtureRoot = ReactDOM.createRoot(host);
    window.__renderCountyNriFixture = (overrides={}) => window.__countyFixtureRoot.render(React.createElement(CountyDirectoryCard, {
      county, nri: {riskRating:'Relatively Moderate',riskScore:0,sourceVersion:'December 2025'},
      nriSourceUrl:'https://example.org/fema', nriLoading:false,nriError:false,
      onInspectCounty:() => {},onSelectPlace:() => {},...overrides
    }));
    window.__renderCountyNriFixture();
  })()`);
  await waitFor('Boolean(document.querySelector("#county-regression-fixture .cb-name"))', 'dense county fixture');
  for (const theme of ['daylight', 'dark', 'miami-vice']) {
    await evaluate(`(() => {
      const select = document.querySelector('[data-testid="theme-select-desktop"]');
      select.value = ${JSON.stringify(theme)}; select.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await pause(120);
    const result = await evaluate(`(() => {
      const card=document.querySelector('#county-regression-fixture .county-brief');
      const figures=[...card.querySelectorAll('[data-figure-key]')];
      const sources=[...card.querySelectorAll('.county-figure-source-record')];
      return {text:card.innerText, figures:figures.length,
        missing:figures.filter(f=>f.innerText.includes('Not reported')).length,
        zeros:figures.filter(f=>/^\\$?0(?:\\.0)?(?:%|\\s*mi|\\s*\\/yr)?$/.test(f.querySelector('dd').innerText.trim())).length,
         sources:sources.length, sourceMetadata:sources.every(s=>/December 2025 release/.test(s.innerText) &&
           /County-equivalent reporting geography/.test(s.innerText) && /January–December 2024/.test(s.innerText)),
         places:card.querySelectorAll('.cb-place').length,
         closed:[...card.querySelectorAll('details:not([open])')].map(detail=>detail.dataset.testid),
        clipped:[...card.querySelectorAll('dl,dt,dd,section,table,th,td,button')].some(e=>e.scrollWidth>e.clientWidth+2),
        links:sources.every(s=>s.querySelector('a')?.href.startsWith('https://example.org/'))};
    })()`);
    assert.equal(result.figures,8,`${label} ${theme}: fixture figure count`);
    assert.equal(result.missing,2,`${label} ${theme}: missing values confused with zero`);
    assert.equal(result.zeros,6,`${label} ${theme}: zero values lost`);
    assert.equal(result.sources,8,`${label} ${theme}: source records lost`);
    assert(result.sourceMetadata && result.links,`${label} ${theme}: source provenance lost`);
    assert.equal(result.places,12,`${label} ${theme}: dense mapped places lost`);
    assert(result.text.includes('32023'),`${label} ${theme}: final ZIP lost`);
     assert(result.closed.every(testId=>testId?.startsWith('panel-acs-county-context-')),
       `${label} ${theme}: only optional Census source context may start collapsed`);
    assert(!result.clipped,`${label} ${theme}: dense fixture clipped`);
    if (forcedScheme) {
      await checkForcedSurface('#county-regression-fixture .county-brief',`${label}-forced-${forcedScheme}-dense-${theme}`);
      assert(result.text.includes('Relatively Moderate') && result.text.includes('Score 0.00'),
        `${label}: forced colors changed the native rating or zero score`);
    } else await capture(`${label}-dense-${theme}`,'#county-regression-fixture');
  }
  if (forcedScheme) {
    for (const [overrides,text] of [
      [{nri:null},'No county-equivalent record'],
      [{nri:{riskRating:null,riskScore:null}},'Rating not stated'],
      [{nriLoading:true},'Loading FEMA record'],
      [{nriError:true},'FEMA NRI source unavailable'],
    ]) {
      await evaluate(`window.__renderCountyNriFixture(${JSON.stringify(overrides)})`);
      await waitFor(`document.querySelector('#county-regression-fixture .cb-risk').innerText.includes(${JSON.stringify(text)})`,text);
      const fallback=await evaluate(`document.querySelector('#county-regression-fixture .cb-risk').innerText`);
      assert(!fallback.includes('Relatively Moderate'),`${label}: fallback invented a FEMA rating`);
      if (text==='Rating not stated') assert(fallback.includes('Score not stated'),`${label}: missing score replaced with zero`);
    }
    await evaluate(`window.__countyFixtureRoot.unmount();document.querySelector('#county-regression-fixture').remove()`);
    return;
  }
  console.log(`✓ ${label}: long names, 24 ZIPs, 12 places, missing/zero figures and eight full source records`);
  // Enlarge the county component within the same physical space. Zooming the
  // whole document also tests unrelated shell/toolbar minimum widths.
  await evaluate(`(() => {
    const host=document.querySelector('#county-regression-fixture');
    host.style.zoom='2';host.style.width='50%';
  })()`);
  await pause(150);
  const enlarged = await evaluate(`(() => {
    const card=document.querySelector('#county-regression-fixture .county-brief');
    return {pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
      figures:card.querySelectorAll('[data-figure-key]').length,
      sources:card.querySelectorAll('.county-figure-source-record').length,
      clipped:[...card.querySelectorAll('dl,dt,dd,section,table,th,td,button')]
        .filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)};
  })()`);
  await capture(`${label}-dense-enlarged`,'#county-regression-fixture');
  await evaluate(`(() => {
    const host=document.querySelector('#county-regression-fixture');
    host.style.zoom='';host.style.width='';
  })()`);
  assert(!enlarged.pageOverflow && enlarged.figures===8 && enlarged.sources===8 &&
    enlarged.clipped.length===0,`${label}: 200% enlargement failed ${JSON.stringify(enlarged)}`);
  console.log(`✓ ${label}: 200% enlargement retains all facts and provenance without clipping`);
}

async function checkInspector(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  await navigate('/?state=FL','Boolean(document.querySelector(".county-inspector-panel"))');
  await waitFor('document.querySelector(".county-inspector-panel")?.innerText.includes("Moderate")','FEMA county preview');
  await waitFor('Boolean(document.querySelector(".county-state-map-svg path"))','County boundary geometry');
  await framing(`${label} preview map`);
  for (const theme of ['daylight','dark','miami-vice']) {
    await evaluate(`(() => {
      const select=document.querySelector('[data-testid="theme-select-desktop"]');
      select.value=${JSON.stringify(theme)};select.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await pause(150);
    const result=await evaluate(`(() => {
      const panel=document.querySelector('.county-inspector-panel');
      const rect=panel.getBoundingClientRect();
      const map=document.querySelector('.county-state-map-panel').getBoundingClientRect();
      return {text:panel.innerText,width:rect.width,height:rect.height,mapHeight:map.height,
        top:rect.top,mapTop:map.top,pageWidth:document.documentElement.scrollWidth,
        closed:panel.querySelectorAll('details:not([open])').length,
        clipped:[...panel.querySelectorAll('dl,dt,dd,section,button,a')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className),
        controls:[...panel.querySelectorAll('button,a')].map(e=>({name:e.innerText,height:e.getBoundingClientRect().height})),
        fema:[...panel.querySelectorAll('a')].some(a=>/FEMA record/.test(a.innerText) &&
          a.href.startsWith('https://') && decodeURIComponent(a.href).includes('12001')),
        numbers:[...panel.querySelectorAll('dl dd')].map(e=>parseFloat(getComputedStyle(e).fontSize))};
    })()`);
    for (const text of ['Alachua County','Gainesville','12001','184,943','18.3','Relatively Moderate','90.33','December 2025'])
      assert(result.text.includes(text),`${label} ${theme}: inspector lost ${text}`);
    assert.equal(result.closed,0,`${label} ${theme}: county details hidden`);
    assert(result.pageWidth<=viewport.width+1,`${label} ${theme}: inspector page overflow`);
    assert.deepEqual(result.clipped,[],`${label} ${theme}: clipped inspector content`);
    assert(result.fema,`${label} ${theme}: FEMA source link missing`);
    if (viewport.width<768) assert(result.controls.every(c=>c.height>=43),`${label} ${theme}: small touch target ${JSON.stringify(result.controls)}`);
    assert(result.numbers.every(n=>n>=12),`${label} ${theme}: inspector facts too small`);
    await capture(`${label}-inspector-${theme}`,'.county-inspector-panel');
    if (viewport.width>=1024) {
      assert(Math.abs(result.top-result.mapTop)<3 && result.mapHeight < viewport.height * .85,
        `${label} ${theme}: map must align with preview without stretching to its content height`);
      console.log(`✓ ${label} ${theme}: preview ${Math.round(result.height)}px / map ${Math.round(result.mapHeight)}px`);
    }
  }
  await evaluate('document.querySelector(\'[data-testid="button-open-inspected-county"]\').focus()');
  await pressEnter();
  await waitFor('Boolean(document.querySelector(".county-city-directory-panel"))','Open inspected county');
  await evaluate('history.back()');
  await waitFor('Boolean(document.querySelector(".county-inspector-panel"))','Return to county inspector');
  await evaluate(`(() => {
    const panel=document.querySelector('.county-inspector-panel');
    const place=[...panel.querySelectorAll('button')].find(b=>/Gainesville/.test(b.innerText));
    if(!place) throw new Error('Inspector place action missing'); place.focus();
  })()`);
  await pressEnter();
  await waitFor('Boolean(document.querySelector(\'[data-testid="button-show-all-places"]\'))','Inspector place keyboard navigation');
  console.log(`✓ ${label}: county preview facts, three themes, touch targets and keyboard county/place navigation`);
}

async function checkCountyReference(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const desktop = viewport.width >= 768;
  await navigate('/?state=FL&county=Alachua%20County',
    'Boolean(document.querySelector(".county-reference-panel") && document.querySelector(".county-municipality-map-panel svg path"))');
  await framing(`${label} county reference`, true);

  for (const theme of ['daylight', 'dark', 'miami-vice']) {
    await evaluate(`(() => {
      const select = document.querySelector('[data-testid="theme-select-desktop"]');
      select.value = ${JSON.stringify(theme)};
      select.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await pause(180);
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const view = await evaluate(`(() => {
      const panel = document.querySelector('.county-reference-panel');
      const map = document.querySelector('.county-municipality-map-panel');
      const panelRect = panel.getBoundingClientRect(), mapRect = map.getBoundingClientRect();
      const focusedPin = document.querySelector('.cv-pin');
      focusedPin?.focus();
      const rows = [...panel.querySelectorAll('.cv-place-row')];
      const sections = [...panel.querySelectorAll('.county-reference-section > h5')].map(node => node.textContent.trim());
      const meta = panel.querySelector('.county-reference-meta');
      const headings = [...panel.querySelectorAll('.county-ref-section-title')];
      return {
        text: panel.innerText,
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        panel: {x:panelRect.x,y:panelRect.y,width:panelRect.width,height:panelRect.height,scroll:panel.scrollWidth,client:panel.clientWidth},
        map: {x:mapRect.x,y:mapRect.y,width:mapRect.width,height:mapRect.height},
        sections,
        headerMeta: meta?.textContent.trim(),
        metaColor: meta ? getComputedStyle(meta).color : '',
        headingColors: headings.map(node => getComputedStyle(node).color),
        placeRows: rows.map(row => ({height:row.getBoundingClientRect().height,scroll:row.scrollWidth,client:row.clientWidth})),
        seatMarker: Boolean(panel.querySelector('.cv-place-ico.is-seat')),
        seatTag: [...panel.querySelectorAll('.cv-tag')].some(node => /county seat/i.test(node.textContent)),
        zipHeadingHasCount: [...panel.querySelectorAll('.cv-section-label')].some(node =>
          /County ZIP references\\s*\\d/i.test(node.textContent)),
        focusedPin: focusedPin ? {
          focusVisible: focusedPin.matches(':focus-visible'),
          ringDash: getComputedStyle(focusedPin.querySelector('.cv-pin-ring')).strokeDasharray,
          ringStroke: getComputedStyle(focusedPin.querySelector('.cv-pin-ring')).stroke,
        } : null,
        placeRowsClipped: rows.some(row => row.scrollWidth > row.clientWidth + 1),
      };
    })()`);
    for (const text of ['Alachua County', 'Florida', '12001', 'County figures', 'FEMA hazard context', 'Sources & coverage', 'Places in Alachua County']) {
      assert(view.text.includes(text), `${label} ${theme}: county reference missing ${text}`);
    }
    assert.deepEqual(view.sections, ['County figures', 'FEMA hazard context', 'Sources & coverage', 'Places in Alachua County'],
      `${label} ${theme}: reference sections out of order`);
    assert(view.headerMeta?.includes('Florida') && view.headerMeta.includes('12001'),
      `${label} ${theme}: state/FIPS context missing`);
    assert(view.panel.scroll <= view.panel.client + 1 && view.pageWidth <= view.width + 1,
      `${label} ${theme}: panel or page horizontal overflow`);
    assert(view.placeRows.every(row => row.height >= 44 && row.scroll <= row.client + 1),
      `${label} ${theme}: place rows are clipped or too small`);
    assert(view.seatMarker && view.seatTag, `${label} ${theme}: county-seat marker is not distinct`);
    assert(!view.zipHeadingHasCount, `${label} ${theme}: ZIP count is repeated in the references heading`);
    assert(view.focusedPin?.focusVisible && view.focusedPin.ringDash !== 'none',
      `${label} ${theme}: map pin lacks a visible keyboard-focus ring`);
    assert(view.metaColor && view.headingColors.every(color => color && color !== 'rgba(0, 0, 0, 0)'),
      `${label} ${theme}: county reference text color is missing`);
    if (desktop) {
      assert(Math.abs(view.map.y - view.panel.y) < 3, `${label} ${theme}: map and county reference do not align at top`);
      assert(view.map.x + view.map.width <= view.panel.x + 1 &&
        view.panel.width >= view.map.width * .9 && view.panel.width <= view.map.width * 1.2,
      `${label} ${theme}: map/reference columns are unbalanced`);
    } else {
      assert(view.map.y < view.panel.y && view.panel.width <= view.width + 1,
        `${label} ${theme}: mobile map/reference should stack and fit`);
    }
    await capture(`${label}-county-reference-${theme}`, '.county-reference-panel');
  }
  console.log(`✓ ${label}: selected-county hierarchy, seat, map focus, responsive layout and three themes`);
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
  const inspectorOnly = process.env.COUNTY_INSPECTOR_ONLY === '1';
  const viewports = [{ width: 1024, height: 640 }, { width: 1366, height: 768 }, { width: 390, height: 844 },
    ...(inspectorOnly ? [{width:430,height:932}] : [])]
    .filter(viewport => !process.env.COUNTY_TEST_WIDTH || viewport.width === Number(process.env.COUNTY_TEST_WIDTH));
  const mapOnly = process.env.COUNTY_MAP_ONLY === '1';
  const cardsOnly = process.env.COUNTY_CARDS_ONLY === '1';
  const homeOnly = process.env.COUNTY_HOME_ONLY === '1';
  const referenceOnly = process.env.COUNTY_REFERENCE_ONLY === '1';
  for (const viewport of viewports) {
    const desktop = viewport.width >= 768;
    const label = `${viewport.width}x${viewport.height}`;
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: !desktop });
    if (referenceOnly) { await checkCountyReference(viewport); continue; }
    if (homeOnly) {
      await navigate('/', 'Boolean(document.querySelector(".home-map-state-path"))');
      await evaluate('document.fonts.ready');
      const frame = await evaluate(`(() => {
        const svg=document.querySelector('.home-map-svg'), stage=document.querySelector('.home-map-stage-v2');
        const viewport=document.querySelector('.home-map-viewport').getBoundingClientRect();
        const b=svg.getBBox(), m=svg.getScreenCTM(), s=stage.getBoundingClientRect();
        const a=new DOMPoint(b.x,b.y).matrixTransform(m), z=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m);
        const shortcuts=[...stage.querySelectorAll('.home-map-shortcut-row button')].map(e=>e.getBoundingClientRect());
        return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,height:innerHeight,stageBottom:s.bottom,
          geoWidth:z.x-a.x,geoHeight:z.y-a.y,fit:Math.max((z.x-a.x)/viewport.width,(z.y-a.y)/viewport.height),
          uncropped:a.x>=viewport.left-2 && z.x<=viewport.right+2 && a.y>=viewport.top-2 && z.y<=viewport.bottom+2,
          shortcutsVisible:shortcuts.every(r=>r.top>=s.top && r.bottom<=s.bottom)};
      })()`);
      await capture(`${label}-home-fit`);
      assert(frame.pageWidth<=frame.width+1 && frame.uncropped, `${label}: Home map overflow/cropping ${JSON.stringify(frame)}`);
      assert(frame.fit>=.9, `${label}: unused map frame space ${JSON.stringify(frame)}`);
      if (viewport.width>=1024) {
        assert(frame.stageBottom<=frame.height, `${label}: map stage extends below screen ${JSON.stringify(frame)}`);
        assert(frame.shortcutsVisible, `${label}: shortcut controls clipped ${JSON.stringify(frame)}`);
        const railContrast = await evaluate(`(() => {
          const rgb=s=>(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
          const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          const stage=document.querySelector('.home-map-stage-v2');
          const bg=lum(rgb(getComputedStyle(stage).backgroundColor));
          return [...stage.querySelectorAll('.home-map-layer-select,.home-map-legend-title,.home-map-legend-endpoint,.home-map-legend-missing-note')].map(e=>{
            const fg=lum(rgb(getComputedStyle(e).color));
            return {text:e.textContent.trim(),ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};
          });
        })()`);
        assert(railContrast.every(e=>e.ratio>=4.5), `${label}: map control contrast ${JSON.stringify(railContrast)}`);
      }
      console.log(`✓ ${label}: full US ${Math.round(frame.geoWidth)}×${Math.round(frame.geoHeight)}px, fitted without cropping`);
      continue;
    }
    if (process.env.COUNTY_FORCED_COLORS_ONLY === '1') { await checkForcedColors(viewport); continue; }
     if (process.env.COUNTY_DENSE_ONLY === '1') { await checkDenseFixture(viewport); continue; }
    if (inspectorOnly) { await checkInspector(viewport); continue; }
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
    await send('Emulation.setFocusEmulationEnabled', {enabled:true});
    await evaluate(`(() => {
      const state = [...document.querySelectorAll('.home-map-state-path')].find(p=>p.getAttribute('aria-label').startsWith('Texas.'));
      state.focus();
    })()`);
    await waitFor('document.querySelector(\'[data-testid="text-preview-state"]\')?.textContent.includes("Texas")', 'keyboard focus updates state preview', 5000);
    assert(await evaluate('document.querySelectorAll(".home-map-leader").length >= 8'), `${label}: Northeast leader labels missing`);
    assert(await evaluate('document.querySelector(\'[data-testid="button-preview-explore"]\').textContent.includes("TX")'), `${label}: preview action targets wrong state`);
    await evaluate('document.activeElement.blur()');
    await capture(`${label}-home`);
    }
    await navigate('/?state=FL', 'Boolean(document.querySelector(\'[data-testid="row-county-signals-12001"]\'))');
    await waitFor('document.querySelector(\'[data-testid="text-fema-nri-rating-12001"]\')?.textContent.includes("Moderate")', 'Florida source-defined FEMA rating');
    await layout(`${label} Florida`, desktop);
    if (!cardsOnly) {
    await waitFor('Boolean(document.querySelector(\'.county-state-map-svg path\'))', 'Florida boundaries');
    await framing(`${label} Florida`);
    const fittedViewBox = await evaluate('document.querySelector(".county-state-map-svg").getAttribute("viewBox")');
    const countyColors = await evaluate('[...document.querySelectorAll(".cv-county-path")].map(p=>[p.getAttribute("aria-label"),p.getAttribute("fill")]).sort()');
    await evaluate('document.querySelector(\'[data-testid="button-county-map-zoom-in"]\').click()');
    await waitFor('document.querySelector(".cv-map-tool-readout").textContent.includes("150%")', 'county map zoom');
    const zoomedViewBox = await evaluate('document.querySelector(".county-state-map-svg").getAttribute("viewBox")');
    assert(Number(zoomedViewBox.split(' ')[2]) < Number(fittedViewBox.split(' ')[2]), `${label}: zoom did not magnify map`);
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".cv-county-path")].map(p=>[p.getAttribute("aria-label"),p.getAttribute("fill")]).sort()'),
      countyColors, `${label}: zoom changed source-defined risk fills`);
    await evaluate('document.querySelector(\'[data-testid="button-county-map-zoom-in"]\').click()');
    await waitFor('document.querySelector(".cv-map-tool-readout").textContent.includes("225%")', 'second zoom');
    await waitFor('document.querySelectorAll(".cv-county-label").length > 0', 'progressive county labels', 5000);
    const labelSizes = await evaluate('[...document.querySelectorAll(".cv-county-label")].map(t=>parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a)');
    assert(labelSizes.every(size=>size >= 11.5), `${label}: county names too small ${labelSizes}`);
    const labelOverlaps = await evaluate(`(() => {
      const boxes=[...document.querySelectorAll('.cv-county-label')].map(t=>t.getBoundingClientRect());
      return boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top));
    })()`);
    assert(!labelOverlaps, `${label}: county labels overlap`);
    await evaluate('document.querySelector(\'[data-testid="button-county-map-fit"]\').click()');
    await waitFor(`document.querySelector(".county-state-map-svg").getAttribute("viewBox")===${JSON.stringify(fittedViewBox)}`, 'fit restores whole-state view');
    assert(await evaluate('document.querySelector(\'[data-testid="button-county-map-zoom-out"]\').disabled'), `${label}: minimum zoom control not disabled`);
    console.log(`✓ ${label}: county zoom/fit preserves risk fills and restores geography`);
    await capture(`${label}-state`);
    }
    const row = await evaluate(`(() => {
      const card = document.querySelector('[data-testid="row-county-signals-12001"]');
      const text = card.innerText;
      const placeButtons = [...card.querySelectorAll('.county-profile-city-list button')];
      const sources = card.querySelector('.county-figure-source-details');
      return {text, cardHeight:card.getBoundingClientRect().height,
        primaryNumberColor:getComputedStyle(card.querySelector('[data-testid="text-county-population-12001"]')).color,
        labelColor:getComputedStyle(card.querySelector('[data-figure-key="population"] dt')).color,
        closedDetails:[...card.querySelectorAll('details:not([open])')].map(detail=>detail.dataset.testid),
        figureKeys:[...card.querySelectorAll('[data-figure-key]')].map(item=>item.getAttribute('data-figure-key')),
        placeNames:placeButtons.map(button=>button.innerText.trim()),sourceText:sources?.innerText ?? '',
        titleSize:parseFloat(getComputedStyle(card.querySelector('h3')).fontSize),
        titleHeight:card.querySelector('h3').getBoundingClientRect().height,
        titleLineHeight:parseFloat(getComputedStyle(card.querySelector('h3')).lineHeight),
        titleFont:getComputedStyle(card.querySelector('h3')).fontFamily,
        ledgerColumns:getComputedStyle(card.querySelector('.cfs-ledger')).gridTemplateColumns};
    })()`);
    assert(!/User review not recorded|End-user review/i.test(row.text), 'Review-status clutter remains');
    assert.deepEqual(row.closedDetails, ['panel-acs-county-context-12001'],
      `${label}: only the optional Census source context may start collapsed`);
    assert.equal(row.placeNames.filter(name => name.toLowerCase() === 'high springs').length, 1, 'Duplicate High Springs');
    assert(row.text.includes('82.354°W') && !row.text.includes('-82.354°W'), 'Incorrect coordinate sign/direction');
    assert(!/No source mapped|No source details attached/i.test(row.text),
      'County card should not imply source failure when no source record is attached');
    assert(row.titleSize >= 14 && !/mono/i.test(row.titleFont), 'County titles too small or monospaced');
    await capture(`${label}-directory`, '[data-testid="row-county-signals-12001"]');
    if (cardsOnly) {
      // Captioned story groups retain all eight figures without microtype.
       console.log(`${label}: first card ${Math.round(row.cardHeight)}px tall; care/community columns ${row.ledgerColumns}`);
      assert(row.titleHeight <= row.titleLineHeight * 1.2, `${label}: county name squeezed into multiple lines`);
      assert.equal(row.figureKeys.length, 8, `${label}: county figures duplicated or removed`);
      assert.equal(new Set(row.figureKeys).size, 8, `${label}: each county figure must appear once`);
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
        const pair = await evaluate(`(() => {
          const cards = [...document.querySelectorAll('.county-signal-list > .county-signal-row')].slice(0,2);
          const cardiac=cards[0].querySelector('[data-testid="text-county-ohca-12001"]');
          const transport=cards[0].querySelector('[data-testid="text-county-transport-12001"]');
          const metrics=[...cards[0].querySelectorAll('[data-figure-key]')].map(metric=>{
            const value=metric.querySelector('dd'), label=metric.querySelector('dt');
          const icon=metric.querySelector('dt .cfs-ico');
          return {key:metric.dataset.figureKey,icon:!!icon && icon.getBoundingClientRect().width>=12,context:!!metric.closest('.cfs-ledger'),color:getComputedStyle(value).color,
              labelColor:getComputedStyle(label).color,size:parseFloat(getComputedStyle(value).fontSize),
              right:value.getBoundingClientRect().right,
              labelClipped:label.scrollWidth > label.clientWidth + 1,
              labelHeight:label.getBoundingClientRect().height,labelLine:parseFloat(getComputedStyle(label).lineHeight),
              valueTop:value.getBoundingClientRect().top,labelBottom:label.getBoundingClientRect().bottom,
              valueLeft:value.getBoundingClientRect().left,labelLeft:label.getBoundingClientRect().left,
              labelRight:label.getBoundingClientRect().right,
              valueBottom:value.getBoundingClientRect().bottom,labelTop:label.getBoundingClientRect().top,
              labelSize:parseFloat(getComputedStyle(label).fontSize)};
          });
           return {metrics,cardiacColor:getComputedStyle(cardiac).color,transportColor:getComputedStyle(transport).color,
             cardiacIconColor:getComputedStyle(cards[0].querySelector('[data-figure-key="annualCardiacArrestIncidents"] svg')).color,
             transportIconColor:getComputedStyle(cards[0].querySelector('[data-figure-key="averageTransportMinutes"] svg')).color,
            groups:['.cfs-lead','.cfs-ledger','.cb-risk','.cb-geo'].map(selector=>{
              const section=cards[0].querySelector(selector);
              return {selector,top:section?.getBoundingClientRect().top};
            }),
            pageOverflow:document.documentElement.scrollWidth > innerWidth + 1,
             seatRect:(()=>{const r=cards[0].querySelector('.cb-seat').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})(),
             titleRect:(()=>{const r=cards[0].querySelector('.cb-name').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})(),
            parentWidth:document.querySelector('.county-signal-list').getBoundingClientRect().width,
            cards:cards.map(card=>{const r=card.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})};
        })()`);
        assert.equal(pair.cards.length, 2, `${label}: missing county pair`);
         assert(pair.metrics.filter(metric=>!metric.context).every(metric=>metric.icon),
           `${label} ${theme}: a primary county metric lost its visible icon`);
        assert(!pair.pageOverflow,`${label} ${theme}: county directory overflows viewport`);
         assert(pair.groups.every((group,index)=>group.top!=null && (index===0 || group.top>=pair.groups[index-1].top)),
           `${label} ${theme}: county brief reading order broken`);
         assert(!(pair.seatRect.left < pair.titleRect.right && pair.seatRect.right > pair.titleRect.left &&
           pair.seatRect.top < pair.titleRect.bottom && pair.seatRect.bottom > pair.titleRect.top),
           `${label} ${theme}: identity metadata overlaps county name`);
         assert.notEqual(pair.cardiacIconColor, pair.transportIconColor, `${label} ${theme}: missing distinct cardiac icon accent`);
        const neutralMetrics=pair.metrics.filter(metric=>metric.key!=='annualCardiacArrestIncidents');
        assert.equal(new Set(neutralMetrics.map(metric=>metric.color)).size,1,
          `${label} ${theme}: decorative metric colors returned`);
         assert.equal(pair.cardiacColor, neutralMetrics[0].color, `${label} ${theme}: metric values should remain neutral`);
         // Compact captions remain readable; lead figures retain a clear size hierarchy.
         assert(pair.metrics.filter(metric=>metric.context).every(metric=>metric.size >= 13 && metric.labelSize >= 11),
           `${label} ${theme}: supporting metric type too small`);
         assert(pair.metrics.filter(metric=>!metric.context).every(metric=>metric.size>=17 && metric.labelSize>=12),
            `${label} ${theme}: primary figures lost their visual hierarchy ${JSON.stringify(pair.metrics.filter(metric=>!metric.context))}`);
        assert(pair.metrics.every(metric=>metric.labelHeight <= metric.labelLine * 3.2),
          `${label} ${theme}: metric labels wrap beyond three lines`);
        assert(pair.metrics.every(metric=>!metric.labelClipped), `${label} ${theme}: metric labels are truncated`);
         assert(pair.metrics.filter(metric=>!metric.context).every(metric=>
            metric.valueTop>=metric.labelBottom-1 || metric.valueLeft>=metric.labelRight-1),
            `${label} ${theme}: primary metric label and value overlap`);
         assert(pair.metrics.filter(metric=>metric.context).every(metric=>
           metric.valueTop>=metric.labelBottom-1 || metric.valueLeft>=metric.labelRight-1),
           `${label} ${theme}: context label and value overlap`);
        if (desktop) {
          assert(Math.abs(pair.cards[0].y - pair.cards[1].y) < 2, `${label} ${theme}: counties not side by side`);
          assert(Math.abs(pair.cards[0].w - pair.cards[1].w) < 2, `${label} ${theme}: unequal card widths`);
          assert(pair.cards[0].w <= pair.parentWidth * .51, `${label} ${theme}: cards not half width`);
        } else {
          assert(pair.cards[1].y > pair.cards[0].y + pair.cards[0].h - 1, `${label} ${theme}: phone cards not stacked`);
        }
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
  if (!homeOnly && !mapOnly && !inspectorOnly && process.env.COUNTY_DENSE_ONLY !== '1' && process.env.COUNTY_FORCED_COLORS_ONLY !== '1') {
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
  if (cardsOnly && !homeOnly) for (const viewport of viewports) await checkDenseFixture(viewport);
  }
  // Include accessibility coverage in the ordinary complete run as well as the
  // focused mode; other *_ONLY modes retain their intentionally narrow scope.
  if (!homeOnly && !mapOnly && !cardsOnly && !inspectorOnly && process.env.COUNTY_DENSE_ONLY !== '1' &&
    process.env.COUNTY_FORCED_COLORS_ONLY !== '1') {
    for (const viewport of viewports) {
      await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<768});
      await checkForcedColors(viewport);
    }
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
