// Static guard for the owned CSS manifest. Uses PostCSS shipped with Vite.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../artifacts/ems-territory-intelligence/', import.meta.url));
const requireApp = createRequire(path.join(app, 'package.json'));
const requireVite = createRequire(requireApp.resolve('vite'));
const postcss = requireVite('postcss');
const src = path.join(app, 'src');
const styles = path.join(src, 'styles');
const manifest = postcss.parse(await readFile(path.join(src, 'index.css'), 'utf8'));
const imports = [];
for (const node of manifest.nodes) {
  assert(node.type === 'comment' || (node.type === 'atrule' && node.name === 'import'),
    'index.css must remain an import-only manifest; edit the owning module');
  if (node.type === 'atrule' && node.params.startsWith('"./styles/')) {
    imports.push(node.params.slice('"./styles/'.length, -1));
  }
}
const files = (await readdir(styles, { recursive: true })).filter(file => file.endsWith('.css'));
assert.equal(new Set(imports).size, imports.length, 'A style module is imported twice');
assert.deepEqual([...imports].sort(), files.sort(), 'Every style module must be imported exactly once');
const phases = ['foundation', 'initial', 'surfaces', 'responsive', 'records', 'theme-bridge', 'contracts'];
const owners = ['shared', 'shell', 'home', 'territory', 'profile', 'specialist', 'county', 'opportunities'];
let previousPhase = -1;
const sourceFiles = (await readdir(src, { recursive: true })).filter(file => /\.tsx?$/.test(file));
const source = (await Promise.all(sourceFiles.map(file => readFile(path.join(src, file), 'utf8')))).join('\n');
let rules = 0;
for (const file of imports) {
  const [owner, name] = file.split('/');
  assert(owners.includes(owner), `Unknown style owner: ${file}`);
  const phase = phases.findIndex(stage => name === `${stage}.css` || name.startsWith(`${stage}-`));
  assert(phase >= previousPhase, `Cascade phase moved backwards at ${file}`);
  previousPhase = phase;
  const root = postcss.parse(await readFile(path.join(styles, file), 'utf8'));
  root.walkRules(rule => {
    rules++;
    for (const match of rule.selector.matchAll(/\.(?:county|municipality|city-map)[\w-]+/g)) {
      const className = match[0].slice(1);
      assert(source.includes(className), `${file}: unused county/map selector .${className}`);
    }
    if (/\.cv-[\w-]+/.test(rule.selector)) {
      assert.equal(owner, 'county', `${file}: current county presentation belongs to county/`);
    }
    if (owner === 'shared') {
      assert(!/\.(?:home-territory|territory-explorer|profile-workspace|pi-primary-sidebar|agency-card-title|agency-card-geography|agency-lead-cards|pulseiq-factor-disclosure)[\w-]*/.test(rule.selector),
        `${file}: workspace/shell presentation does not belong in shared/`);
    }
  });
}
for (const [earlier, later] of [
  ['territory/surfaces.css', 'shared/surfaces-controls.css'],
  ['territory/records.css', 'shared/records.css'],
  ['profile/records.css', 'shared/records.css'],
  ['shell/theme-bridge.css', 'shell/contracts.css'],
]) {
  assert(imports.indexOf(earlier) < imports.indexOf(later), `${later} must follow ${earlier}`);
}
console.log(`PASS style ownership: ${imports.length} modules, ${rules} rules, ordered phases and no obsolete county/map selectors`);
