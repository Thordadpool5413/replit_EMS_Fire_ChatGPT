import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldShowTransientNotice } from './transientNoticePolicy';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

test('routine save, export, and restore confirmations stay quiet', () => {
  for (const action of ['save', 'export', 'restore']) {
    assert.equal(
      shouldShowTransientNotice('success'),
      false,
      `${action} success should not interrupt the user`,
    );
  }
});

test('offline consequences remain visible', () => {
  assert.equal(shouldShowTransientNotice('warn'), true);
});

test('browser-only and no-cloud-write boundaries remain visible', () => {
  assert.equal(shouldShowTransientNotice('boundary'), true);
});

test('errors remain visible while routine information stays quiet', () => {
  assert.equal(shouldShowTransientNotice('error'), true);
  assert.equal(shouldShowTransientNotice('info'), false);
});

test('save and offline flows use visible boundary and warning notices', () => {
  const app = readSource('../App.tsx');
  const topBar = readSource('../components/TopBar.tsx');

  assert.match(app, /if \(!shouldShowTransientNotice\(type\)\) return;/);
  assert.match(app, /Saved to this browser only; it was not shared with other users\.', 'boundary'/);
  assert.match(app, /await syncPendingChanges\(\)/);
  assert.match(app, /Saved on this device\. Waiting for a connection\./);
  assert.match(topBar, /Offline: local changes stay on this device until sync resumes\./);
});

test('backup, restore, export, and local import results stay quiet or inline', () => {
  const backup = readSource('../components/CloudBackupResilienceView.tsx');
  const claims = readSource('../components/MedicareDenialImportPanel.tsx');
  const gateway = readSource('../components/NationwideDataGatewayView.tsx');

  assert.doesNotMatch(backup, /showToast\([\s\S]*?'success'/);
  assert.match(backup, /Snapshot could not be saved/);
  assert.match(backup, /data-testid="notice-source-record-import"/);
  assert.match(backup, /This data stays in this browser; no cloud write was performed\./);
  assert.match(backup, /LOCAL_SNAPSHOT_RESTORED/);
  assert.match(claims, /Imported and saved in this browser only\./);
  assert.doesNotMatch(gateway, /showToast/);
  assert.match(gateway, /setAnonymizedResult\(executeSafeHarborAnonymization/);
});
