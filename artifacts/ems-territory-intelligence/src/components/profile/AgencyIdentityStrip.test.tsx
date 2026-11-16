import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Agency} from '../../types';
import {AgencyIdentityStrip} from './AgencyIdentityStrip';

test('briefing exposes the address, main phone, three contacts and evidence without inferring authority', () => {
  const agency = {address:'100 Main Street',city:'Example City',stateCode:'FL',zipCode:'32001',headquartersPhone:'555-0100',officialWebsite:'https://example.org',keyContacts:Array.from({length:4},(_,i)=>({id:String(i),name:`Contact ${i}`,title:'Fire Chief',role:'Fire Chief',email:`person${i}@example.org`,phone:'555-0101',verificationSource:'Agency website'})),factEvidence:{providerAddress:{sourceName:'Registry address',sourceRecordId:'1',reviewed:false,reportingPeriod:'2025',sourceUrl:'https://example.org/source'}}} as Agency;
  const html=renderToStaticMarkup(<AgencyIdentityStrip agency={agency} onPeople={()=>{}}/>);
  for(const value of ['100 Main Street','32001','tel:555-0100','Contact 0','Contact 2','Registry address','2025','View all people']) assert(html.includes(value),value);
  assert(!html.includes('Contact 3'));
  assert.equal((html.match(/Purchasing authority unconfirmed/g)||[]).length,3);
});
test('missing fields and unsafe source links remain explicit and non-actionable', () => {
  const agency={city:'Example',stateCode:'FL',officialWebsite:'javascript:alert(1)',keyContacts:[],factEvidence:{providerAddress:{sourceName:'Unreviewed import',sourceRecordId:'1',reviewed:false,sourceUrl:'javascript:alert(1)'}}} as unknown as Agency;
  const html=renderToStaticMarkup(<AgencyIdentityStrip agency={agency} onPeople={()=>{}}/>);
  for(const value of ['Street address not recorded','Main phone not recorded','Website not recorded','No contacts are recorded','Source period not recorded']) assert(html.includes(value),value);
  assert(!html.includes('href="javascript:'));
  assert(!html.includes('>Directions'));
});
