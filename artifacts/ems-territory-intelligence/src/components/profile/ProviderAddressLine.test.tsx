import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Agency} from '../../types';
import {ProviderAddressLine} from './ProviderAddressLine';
const a={id:'registry-FDID-FL-F123',name:'Example Fire Department',stateCode:'FL',city:'Example',zipCode:'32901',address:'',registryIdentity:{sourceName:'USFA NFDR',identifier:'F123',stateCode:'FL',name:'Example Fire Department',city:'Example',postalCode:'32901',address:'123 Main Street',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-17'}} as Agency;
test('profile header exposes the actual source street and directions, even when top-level address is blank',()=>{
 const html=renderToStaticMarkup(<ProviderAddressLine agency={a} directory={[a]} onReview={()=>{}}/>);
 assert.match(html,/123 Main Street, Example, FL 32901/);assert.match(html,/registry headquarters/);assert.match(html,/link-header-directions/);assert.match(html,/Locate on agency map/);
});
test('a geographic prospect does not present a modeled headquarters address or directions',()=>{
 const b={...a,id:'fire-fl-12009',registryIdentity:undefined,address:'Example Fire Headquarters, Example'};
 const html=renderToStaticMarkup(<ProviderAddressLine agency={b} directory={[b]} onReview={()=>{}}/>);
 assert.match(html,/Street address not established/);assert.doesNotMatch(html,/link-header-directions|Example Fire Headquarters/);
});
