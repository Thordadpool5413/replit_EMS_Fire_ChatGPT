import ohioEmsDepartments from '../data/emsDepartmentCodes.json';
import aliases from '../data/providerDepartmentAliases.json';
import type { ProviderProfileRef } from '../navigation/providerProfileUrl';

const byState: Record<string, Record<string,string>> = aliases;
const combined = new Set<string>(ohioEmsDepartments);
for (const [state, sources] of Object.entries(byState)) {
  for (const [key, fdid] of Object.entries(sources)) {
    if (/^(NPI:|STATE-EMS:FL:license:|TX-DSHS:license:)/.test(key)) combined.add(state + ':' + fdid);
  }
}

export function departmentKey(state: string, sourceKey?: string) {
  if (!sourceKey) return undefined;
  if (sourceKey.startsWith('FDID:' + state + ':')) return sourceKey;
  const fdid = byState[state]?.[sourceKey];
  return fdid ? 'FDID:' + state + ':' + fdid : undefined;
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
  return key ? { state: ref.state, source:'registry', id:'usfa:' + key.slice(5) } : ref;
}

export function departmentAliases(state: string, key?: string) {
  if (!key?.startsWith('FDID:' + state + ':')) return [];
  const id = key.split(':')[2];
  return Object.entries(byState[state] ?? {}).filter(([, fdid]) => fdid === id).map(([alias]) => alias);
}
