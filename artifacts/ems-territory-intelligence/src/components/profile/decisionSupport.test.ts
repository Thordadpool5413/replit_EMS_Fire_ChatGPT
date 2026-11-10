import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency, DocumentedTradeInOffer } from '../../types';
import { buildMeetingBrief, buildRecommendations, calendarDate, dateState, emptyResearch, loadResearch, preparationGaps, quoteState, saveResearch, validateResearch } from './decisionSupport';
import { offerTotal } from './equipmentInsights';

const agency = (values: Partial<Agency> = {}) => ({
  id: 'agency-1', name: 'Test EMS', installedFleet: {
    defibBrand: 'Recorded monitor', defibAgeYears: 9, defibUnitsCount: 12,
    mechanicalCPR: 'Recorded CPR', transportVentilator: 'Recorded ventilator',
    epcrCadSoftware: 'Combined software', billingSoftware: 'Recorded billing',
    defibWarrantyStatus: 'Expired',
  }, competitorContract: { contractEndDate: '2027-01-10' }, grantStatus: { afgAwarded: true },
  ...values,
} as Agency);
const today = new Date('2026-11-10T12:00:00Z');
const quote: DocumentedTradeInOffer = {
  id: 'q1', provider: 'Quoted provider', kind: 'cash-buyback', eligibleDevice: 'Recorded monitor',
  eligibleQuantity: 2, perUnitValue: 1000, currency: 'USD', sourceName: 'Written quote',
  sourceUrl: 'https://example.org/quote', offerDate: '2026-11-01', expiryDate: '2026-11-09',
  conditions: 'Inspection required',
};

test('calendar dates do not roll over; expiry is inclusive and future quotes are not available', () => {
  assert.equal(calendarDate('2026-02-30'), null);
  assert.equal(calendarDate('2024-02-29'), '2024-02-29');
  assert.equal(calendarDate('11/10/2026'), null);
  assert.equal(dateState('2026-11-10', today), 'Due today');
  assert.match(dateState('2026-11-11', today), /1 day/);
  assert.match(quoteState(quote, today), /^Expired/);
  assert.match(quoteState({ ...quote, expiryDate: '2026-11-10' }, today), /Expires today/);
  assert.match(quoteState({ ...quote, offerDate: '2026-12-01', expiryDate: '2026-12-31' }, today), /Future-dated/);
  assert.match(quoteState({ ...quote, expiryDate: undefined }, today), /Expiry unknown/);
  assert.match(quoteState({ ...quote, offerDate: undefined, expiryDate: '2027-01-01' }, today), /Issue date unknown/);
  assert.match(quoteState({ ...quote, expiryDate: '2026-10-01' }, today), /Invalid dates/);
});

test('age alone is a low-confidence discovery input; unsourced warranty, contract and grant flags do not create documented opportunities', () => {
  const results = buildRecommendations(agency(), emptyResearch(), today);
  assert.equal(results.length, 1);
  assert.equal(results[0].confidence, 'Low');
  assert.match(results[0].rationale, /not evidence of failure/);
  assert.doesNotMatch(results[0].nextAction, /must replace|buy now/i);
  assert.equal(buildRecommendations(agency({
    competitorContract: { contractEndDate: '2027-01-10', contractSourceDoc: 'Not reported' } as Agency['competitorContract'],
  }), emptyResearch(), today).length, 1);
});

test('sourced contract, warranty and user notices retain their evidence and actionable caveats', () => {
  const research = emptyResearch();
  research.signals.push({ id: 'grant', kind: 'grant', title: 'Equipment grant notice', sourceName: 'Agency notice', sourceUrl: 'https://example.org/grant', date: '2026-12-01', detail: 'Allowable equipment requires review' });
  const record = agency({
    factEvidence: { maintenanceContracts: {
      reviewed: true, sourceName: 'Service document', sourceUrl: 'https://example.org/service',
      sourceRecordId: 'service-1',
    } },
  });
  const results = buildRecommendations(record, research, today);
  assert.equal(results.length, 4);
  assert.match(results[0].nextAction, /agency eligibility/);
  assert.equal(results[0].sourceUrl, 'https://example.org/grant');
  assert.match(results.find(r => r.id === 'record-contract')!.nextAction, /does not prove.*lapsed/);
  assert.match(results.find(r => r.id === 'record-warranty')!.nextAction, /do not assume/);
});

test('eligibility checks preserve zero, flag restrictions, and never default to the installed fleet', () => {
  assert.equal(preparationGaps().length, 4);
  assert.deepEqual(preparationGaps({ eligibleQuantity: 0, ownership: 'owned', condition: 'Inspected', accessories: 'No accessories included' }), []);
  assert.deepEqual(preparationGaps({ eligibleQuantity: 2, ownership: 'leased', condition: 'Working', accessories: 'Listed' }), ['Release permission']);
  assert.equal(offerTotal(quote), 2000);
  assert.equal(offerTotal({ ...quote, eligibleQuantity: undefined }), null);
});

test('meeting brief contains six recorded systems, citations, quote warnings, and exactly five questions', () => {
  const research = emptyResearch();
  research.offers.push(quote);
  const brief = buildMeetingBrief(agency(), research, today);
  assert.equal(brief.equipment.length, 6);
  assert.equal(brief.questions.length, 5);
  assert.match(brief.text, /Combined software/);
  assert.match(brief.text, /Expired/);
  assert.match(brief.text, /Inspection required/);
  assert.match(brief.text, /https:\/\/example.org\/quote/);
  assert.match(brief.text, /Eligible quantity/);
  assert.match(brief.text, /not evidence of failure/);
  assert.match(buildMeetingBrief(agency(), emptyResearch(), today).text, /No current quote recorded/);
});

test('browser-local records survive reload, remain agency-specific, and can be edited and removed', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const research = emptyResearch();
  research.offers = [quote];
  saveResearch('agency-1', research, storage);
  assert.equal(loadResearch('agency-1', storage).data.offers[0].perUnitValue, 1000);
  assert.deepEqual(loadResearch('agency-2', storage).data, emptyResearch());
  research.offers[0] = { ...quote, perUnitValue: 2000 };
  saveResearch('agency-1', research, storage);
  assert.equal(loadResearch('agency-1', storage).data.offers[0].perUnitValue, 2000);
  research.offers = [];
  saveResearch('agency-1', research, storage);
  assert.equal(loadResearch('agency-1', storage).data.offers.length, 0);
});

test('invalid financial inputs, unsafe sources, impossible dates, malformed storage and save failures are explicit', () => {
  for (const offer of [
    { ...quote, eligibleQuantity: 1.5 }, { ...quote, perUnitValue: -1 },
    { ...quote, currency: 'usd' }, { ...quote, sourceUrl: 'javascript:alert(1)' },
    { ...quote, expiryDate: '2026-02-30' }, { ...quote, conditions: {} },
  ]) {
    assert.throws(() => validateResearch({ ...emptyResearch(), offers: [offer as DocumentedTradeInOffer] }));
  }
  assert.throws(() => saveResearch('agency-1', emptyResearch(), { getItem: () => null, setItem: () => { throw new Error('quota'); } }), /Could not save/);
  assert.match(loadResearch('agency-1', { getItem: () => '{"broken":true}', setItem: () => {} }).error!, /not been overwritten/);
  assert.throws(() => validateResearch({ ...emptyResearch(), signals: [{ id: 'x', title: 'x', kind: 'grant', sourceName: 'x', sourceUrl: 'https://example.org', detail: {} } as never] }));
});
