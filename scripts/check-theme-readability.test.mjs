import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gisGroupTimeout, planGisGroups } from './lib/theme-gis-groups.mjs';

test('default GIS plan preserves every light/dark legend and risk combination', () => {
  const groups = planGisGroups({});
  assert.equal(groups.length, 26);
  assert.equal(new Set(groups.map(({ id }) => id)).size, 26);
  for (const theme of ['daylight', 'dark']) {
    assert.equal(groups.filter((group) => group.theme === theme && group.check === 'legend').length, 4);
    for (const layer of ['survival', 'aed', 'transport']) {
      assert.deepEqual(groups.filter((group) => group.theme === theme && group.layer === layer).map(({ check }) => check),
        ['legend', 'kde', 'hexbin', 'choropleth']);
    }
  }
});

test('theme/layer/check filters select only requested groups, deduplicate, and support Miami Vice', () => {
  assert.deepEqual(planGisGroups({
    THEME_GIS_THEMES: 'miami-vice,miami-vice', THEME_GIS_LAYERS: 'survival',
    THEME_GIS_CHECKS: 'kde, choropleth',
  }).map(({ id }) => id), ['miami-vice:survival:kde', 'miami-vice:survival:choropleth']);
  assert.equal(planGisGroups({ THEME_GIS_RISK_ONLY: '1' }).length, 18);
});

test('invalid or empty selections and unsafe budgets fail rather than passing an empty run', () => {
  for (const env of [
    { THEME_GIS_THEMES: 'light' }, { THEME_GIS_LAYERS: '' },
    { THEME_GIS_CHECKS: 'heat' }, { THEME_GIS_LAYERS: 'ohca', THEME_GIS_CHECKS: 'kde' },
    { THEME_GIS_RISK_ONLY: '1', THEME_GIS_CHECKS: 'legend' },
  ]) assert.throws(() => planGisGroups(env));
  for (const value of ['0', '-1', 'NaN', 'Infinity', '240001', '']) {
    assert.throws(() => gisGroupTimeout({ THEME_GIS_GROUP_TIMEOUT_MS: value }));
  }
  assert.equal(gisGroupTimeout({}), 90_000);
});

test('list mode needs no browser and prints the exact selected plan', () => {
  const result = spawnSync(process.execPath, ['scripts/check-theme-readability.mjs', '--list-gis-groups'], {
    encoding: 'utf8',
    env: {
      ...process.env, THEME_TEST_WIDTH: '1280', THEME_GIS_THEMES: 'dark',
      THEME_GIS_LAYERS: 'transport', THEME_GIS_CHECKS: 'hexbin', CHROMIUM_PATH: '/nonexistent',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GIS plan: 1 groups/);
  assert.match(result.stdout, /1280px dark:transport:hexbin/);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test('bad widths and GIS filters outside GIS mode fail before browser startup', () => {
  for (const options of [
    { THEME_TEST_WIDTH: 'abc' }, { THEME_TEST_WIDTH: '999' }, { THEME_TEST_WIDTH: '0' },
    { THEME_GIS_THEMES: 'dark' },
  ]) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('THEME_')));
    const result = spawnSync(process.execPath, ['scripts/check-theme-readability.mjs'], {
      encoding: 'utf8', env: { ...env, ...options, CHROMIUM_PATH: '/nonexistent' },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stderr, /ENOENT/);
    assert.doesNotMatch(result.stdout, /PASS/);
  }
});

for (const mode of ['timeout', 'SIGTERM', 'SIGINT', 'launch-error']) {
  test(`${mode} exits nonzero and removes the browser process group and temporary profile`, { timeout: 10_000 }, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gis-cleanup-test-'));
    let child;
    let browserPid;
    try {
      const browser = path.join(directory, 'browser');
      const pidFile = path.join(directory, 'browser.pid');
      // Simulate a browser stuck before its debugging endpoint is ready.
      await writeFile(browser, '#!/bin/sh\necho $$ > "$TEST_BROWSER_PID_FILE"\nsleep 60\n', { mode: 0o755 });
      child = spawn(process.execPath, ['scripts/check-theme-readability.mjs'], {
        env: {
          ...process.env, TMPDIR: directory, TEST_BROWSER_PID_FILE: pidFile,
          CHROMIUM_PATH: mode === 'launch-error' ? `${browser}-missing` : browser,
          THEME_GIS_ONLY: '1', THEME_TEST_WIDTH: '1280',
          THEME_GIS_THEMES: 'dark', THEME_GIS_LAYERS: 'aed', THEME_GIS_CHECKS: 'choropleth',
          THEME_GIS_GROUP_TIMEOUT_MS: mode === 'timeout' ? '500' : '5000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
      if (mode !== 'launch-error') {
        const deadline = Date.now() + 3000;
        while (!browserPid && Date.now() < deadline) {
          browserPid = await readFile(pidFile, 'utf8').then(Number).catch(() => undefined);
          if (!browserPid) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.ok(browserPid, output);
        if (mode.startsWith('SIG')) child.kill(mode);
      }
      const result = await closed;
      assert.equal(result.signal, null, output);
      assert.equal(result.code, mode === 'launch-error' ? 1 : 2, output);
      assert.match(output, mode === 'launch-error' ? /ENOENT/ : /INCOMPLETE/);
      assert.doesNotMatch(output, /PASS/);
      assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('ems-theme-readability-')), []);
      if (browserPid) assert.throws(() => process.kill(-browserPid, 0), { code: 'ESRCH' });
    } finally {
      if (child && child.exitCode === null) child.kill('SIGKILL');
      if (browserPid) {
        try { process.kill(-browserPid, 'SIGKILL'); } catch { /* Already cleaned up. */ }
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
}
