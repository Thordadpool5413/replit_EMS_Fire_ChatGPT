import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DATA_LABELS, DataLabel, dataLabelTone, inferDataLabelKind } from './DataLabel';
import { NumericMetric } from './NumericMetric';

test('every semantic category has a visible label and decorative icon', () => {
  for (const kind of Object.keys(DATA_LABELS) as (keyof typeof DATA_LABELS)[]) {
    const html = renderToStaticMarkup(<DataLabel kind={kind} />);
    assert.ok(html.includes(DATA_LABELS[kind].label), kind);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /focusable="false"/);
    assert.ok(html.includes(`data-label-kind="${kind}"`));
    assert.doesNotMatch(html, /<button|role="button"|tabindex/i);
  }
});

test('specific meanings take precedence over broad terms', () => {
  assert.equal(inferDataLabelKind('Average EMS transport time'), 'transportTime');
  assert.equal(inferDataLabelKind('Annual EMS transports'), 'transports');
  assert.equal(inferDataLabelKind('Cardiac arrests per year'), 'cardiac');
  assert.equal(inferDataLabelKind('Primary cath lab distance'), 'distance');
  assert.equal(inferDataLabelKind('Median household income'), 'income');
  assert.equal(inferDataLabelKind('Warranty expiration'), 'warranty');
  assert.equal(inferDataLabelKind('Something not mapped'), 'info');
});

test('topic colors identify subject without turning risk or review into a status', () => {
  assert.equal(dataLabelTone('population'), 'community');
  assert.equal(dataLabelTone('transports'), 'operations');
  assert.equal(dataLabelTone('equipment'), 'planning');
  assert.equal(dataLabelTone('cardiac'), 'clinical');
  assert.equal(dataLabelTone('risk'), 'reference');
  assert.equal(dataLabelTone('review'), 'reference');
  for (const kind of Object.keys(DATA_LABELS) as (keyof typeof DATA_LABELS)[]) {
    const html = renderToStaticMarkup(<DataLabel kind={kind} />);
    assert.ok(html.includes(`data-label-tone="${dataLabelTone(kind)}"`));
  }
});

test('explicit category and custom source wording are preserved', () => {
  const html = renderToStaticMarkup(
    <DataLabel kind="risk">FEMA source-defined hazard rating</DataLabel>,
  );
  assert.match(html, /data-label-kind="risk"/);
  assert.match(html, /FEMA source-defined hazard rating/);
  assert.doesNotMatch(html, /Confirmed|Verified|At risk/);
});

test('generic numerical metrics retain value, units and original label', () => {
  const html = renderToStaticMarkup(
    <NumericMetric value={0} label="Annual EMS transports" context="FY2025 · transports/year" />,
  );
  assert.match(html, />0<\/span>/);
  assert.match(html, /Annual EMS transports/);
  assert.match(html, /FY2025 · transports\/year/);
  assert.match(html, /data-label-kind="transports"/);
});
