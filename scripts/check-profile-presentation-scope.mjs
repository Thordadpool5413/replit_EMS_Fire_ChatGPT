/**
 * Guard this visual-only change against modifications to calculations, data
 * expressions and existing interactive behavior. Compare with the PR base.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const base = process.env.PROFILE_BASE_SHA || process.argv[2];
assert.match(base || '', /^[a-f0-9]{40}$/, 'Provide the reviewed base commit SHA');
const app = 'artifacts/ems-territory-intelligence/src/';
const modifiedComponents = [
  'components/FocusedProviderProfile.tsx',
  'components/profile/AgencyIdentityStrip.tsx',
  'components/profile/DealDiscoveryWorkspace.tsx',
  'components/profile/ProfileCommandOverview.tsx',
].map(p => app + p);
const allowed = new Set([
  ...modifiedComponents, app + 'index.css', app + 'styles/profile/contracts.css',
  app + 'components/profile/ProfileContactDisclosure.tsx',
  app + 'components/profile/ProfileContactDisclosure.test.tsx',
  'scripts/check-profile-presentation-scope.mjs',
  'scripts/check-profile-redesign.mjs',
  '.github/workflows/profile-presentation.yml',
]);
const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
for (const path of changed) assert.ok(allowed.has(path), 'Unexpected visual-only change: ' + path);
const printer = ts.createPrinter({ removeComments: true });
function fingerprint(source, path) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const jsxExpressions = [], attributes = [];
  const normalized = node => {
    const result = ts.transform(node, [ctx => {
      const visit = n => {
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return ctx.factory.createIdentifier('PRESENTATION');
        // Navigation helper text is the only changed expression string.
        if (ts.isStringLiteral(n)) return ctx.factory.createStringLiteral(n.text === 'Names, roles and contact details in People' ? 'Names, roles and contact details below' : n.text);
        return ts.visitEachChild(n, visit, ctx);
      };
      return visit;
    }]);
    const text = printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], file);
    result.dispose();
    return text;
  };
  const walk = node => {
    if (ts.isJsxExpression(node) && node.expression) jsxExpressions.push(normalized(node.expression));
    if (ts.isJsxAttribute(node) && node.name.getText(file) !== 'className') attributes.push(normalized(node));
    ts.forEachChild(node, walk);
  };
  walk(file);
  const nonVisualStatements = file.statements.filter(s => {
    if (ts.isImportDeclaration(s)) return false;
    return !(ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(file) === 'PROFILE_SECTIONS'));
  }).map(normalized);
  return {
    code: nonVisualStatements.join('\n'),
    expressions: jsxExpressions.sort(),
    attributes: attributes.sort(),
    handlers: attributes.filter(a => /^on[A-Z]/.test(a)).sort(),
  };
}
for (const path of modifiedComponents) {
  const original = execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const current = readFileSync(path, 'utf8');
  assert.deepEqual(fingerprint(current, path), fingerprint(original, path),
    path + ': data, callbacks, validation, save behavior or rendering conditions changed');
}
console.log('PASS visual-only parity: existing expressions, event handlers, validation and non-presentation logic are unchanged');
