import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileContactDisclosure } from './ProfileContactDisclosure';
import { AgencyIdentityStrip } from './AgencyIdentityStrip';
import type { Agency } from '../../types';

test('collapsed contacts keep the full existing identity content mounted', () => {
  const agency = Object.freeze({
    id: 'presentation-fixture', name: 'Example EMS', address: '100 Example Street',
    city: 'Example City', stateCode: 'FL', zipCode: '12345',
    headquartersPhone: '8001234567', officialWebsite: 'https://example.org',
    keyContacts: Object.freeze([Object.freeze({
      id: 'contact', name: 'Example Chief', title: 'EMS Chief',
      email: 'chief@example.org', phone: '8002345678',
    })]),
  }) as unknown as Agency;
  const before = JSON.stringify(agency);
  const identity = <AgencyIdentityStrip agency={agency} onPeople={() => {}} />;
  const original = renderToStaticMarkup(identity);
  const wrapped = renderToStaticMarkup(<ProfileContactDisclosure>{identity}</ProfileContactDisclosure>);
  assert.ok(wrapped.includes(original), 'The wrapper preserves every identity value, source and action');
  assert.ok(!wrapped.slice(0, wrapped.indexOf('<summary')).includes('open='), 'Contacts start collapsed');
  assert.ok(wrapped.includes('Location &amp; recorded contacts'));
  assert.doesNotMatch(wrapped, /authority unconfirmed|confirm each person/i);
  assert.equal(JSON.stringify(agency), before, 'Rendering does not mutate the record');
});
