import siteAliases from '../data/providerSiteAliases.json';
import ohioEmsDepartments from '../data/emsDepartmentCodes.json';
import aliases from '../data/providerDepartmentAliases.json';
import type { ProviderProfileRef } from '../navigation/providerProfileUrl';

const byState: Record<string, Record<string,string>> = aliases;
const aliasesByDepartment = new Map<string, string[]>();
const siteByState:Record<string,Record<string,string>>=siteAliases;
const combined = new Set<string>(ohioEmsDepartments);
for (const [state, sources] of Object.entries(byState)) {
  for (const [key, fdid] of Object.entries(sources)) {
    const department = 'FDID:' + state + ':' + fdid;
    const entries = aliasesByDepartment.get(department) ?? [];
    entries.push(key);
    aliasesByDepartment.set(department, entries);
    if (/^(NPI:|STATE-EMS:FL:license:|TX-DSHS:license:)/.test(key)) combined.add(state + ':' + fdid);
  }
}


for (const [state,sources] of Object.entries(siteByState)) {
  for (const [key,target] of Object.entries(sources)) {
    const entries=aliasesByDepartment.get(target) ?? [];
    entries.push(key); aliasesByDepartment.set(target,entries);
    if (target.startsWith('FDID:') && /^(NPI:|STATE-EMS:FL:license:|TX-DSHS:license:)/.test(key)) combined.add(target.slice(5));
  }
}

export function departmentKey(state: string, sourceKey?: string) {
  if (!sourceKey) return undefined;
  if (sourceKey.startsWith('FDID:' + state + ':')) return sourceKey;
  const fdid = byState[state]?.[sourceKey];
  return fdid ? 'FDID:' + state + ':' + fdid : siteByState[state]?.[sourceKey];
}

export function isCombinedDepartment(key?: string) {
  return !!key && combined.has(key.replace(/^FDID:/, ''));
}

export function profileSourceKey(ref: ProviderProfileRef) {
  if (ref.source === 'neris') return 'NERIS:' + ref.id;
  if (ref.source === 'state-ems') return ['STATE-EMS', ref.state, ref.state === 'FL' ? 'license' : 'agency-code', ref.id].join(':');
  return ref.id.replace(/^usfa:/, 'FDID:').replace(/^nppes:/, 'NPI:');
}

export function departmentProfile(ref: ProviderProfileRef): ProviderProfileRef {
  const key = departmentKey(ref.state, profileSourceKey(ref));
  if (key?.startsWith('NPI:')) return {state:ref.state,source:'registry',id:'nppes:'+key.slice(4)};
  return key ? { state: ref.state, source:'registry', id:'usfa:' + key.slice(5) } : ref;
}

export function departmentAliases(state: string, key?: string) {
  if (!key || (!key.startsWith('NPI:') && !key.startsWith('FDID:' + state + ':'))) return [];
  return aliasesByDepartment.get(key) ?? [];
}
