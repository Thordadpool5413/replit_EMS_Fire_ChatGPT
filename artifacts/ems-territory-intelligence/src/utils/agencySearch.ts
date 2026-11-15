import type { Agency } from '../types';
const aliases:Record<string,string>={ems:'emergency medical services',fd:'fire department',dept:'department',vfd:'volunteer fire department',vol:'volunteer',st:'saint'};
export function normalizeAgencySearch(value:string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>aliases[word]??word).join(' ');
}
export function agencySearchScore(agency:Agency,query:string):number {
  const q=normalizeAgencySearch(query);if(!q)return 1;
  const names=[agency.name,...(agency.alternateNames??[])].map(normalizeAgencySearch);
  if(names.includes(q))return 100;
  const haystack=normalizeAgencySearch([agency.name,...(agency.alternateNames??[]),agency.city,agency.county,agency.state,agency.stateCode,agency.zipCode,agency.fdid,...(agency.keyContacts??[]).map(c=>c.name)].filter(Boolean).join(' '));
  const words=haystack.split(' ');
  if(!q.split(' ').every(token=>words.some(word=>token.length<3?word===token:word.startsWith(token))))return 0;
  return names.some(name=>name.includes(q))?80:50;
}
