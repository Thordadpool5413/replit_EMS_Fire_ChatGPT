import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../types';
import { CountySavedProfiles } from './CountySavedProfiles';

function profile(overrides: Partial<Agency>): Agency {
  return {
    id: 'agency-1',
    name: 'Example County EMS',
    agencyType: 'EMS',
    dataProvenanceTier: 'source_native',
    ...overrides,
  } as Agency;
}

test('county shortcuts open only saved profiles and label geography prospects distinctly', () => {
  const markup = renderToStaticMarkup(
    <CountySavedProfiles
      countyName="Example County"
      profiles={[
        profile({ id: 'agency-2', name: 'Example Fire', agencyType: 'Fire Department' }),
        profile({ id: 'territory-fl-ems-00001', name: 'Example Prospect', dataProvenanceTier: 'generated_prospect' }),
      ]}
      status="ready"
      onOpen={() => {}}
    />,
  );

  assert.match(markup, /Saved profiles in Example County/);
  assert.match(markup, /Open profile/);
  assert.match(markup, /Geography-generated prospect/);
  assert.match(markup, /Source records do not become profiles unless someone explicitly reviews/);
});

test('empty county profile state does not imply no providers exist', () => {
  const markup = renderToStaticMarkup(
    <CountySavedProfiles countyName="Example County" profiles={[]} status="ready" />,
  );
  assert.match(markup, /No saved profiles match the current county filters/);
  assert.match(markup, /they are not saved profiles/);
});

test('unavailable county profile state does not claim a confirmed absence', () => {
  const markup = renderToStaticMarkup(
    <CountySavedProfiles countyName="Example County" profiles={[]} status="unavailable" />,
  );
  assert.match(markup, /could not be refreshed/);
  assert.match(markup, /not evidence that none exist/);
});

test('county profile cards display agency facts and source details without opening the profile', () => {
  const markup = renderToStaticMarkup(
    <CountySavedProfiles countyName="Flagler County" profiles={[
      profile({
        name: 'Flagler County Fire Rescue',
        registryIdentity: {
          sourceName: 'State EMS', identifierKind: 'license', identifier: '1801',
          stateCode: 'FL', name: 'Flagler County Fire Rescue',
          sourceUrl: 'https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf', retrievedAt: '2026-11-24',
        },
      }),
    ]} status="ready" />,
  );
  assert.match(markup, /\$46,268/);
  assert.match(markup, /Requested/);
  assert.match(markup, /14,138/);
  assert.match(markup, /Which pads and connectors/);
  assert.match(markup, /View card data and sources/);
});
