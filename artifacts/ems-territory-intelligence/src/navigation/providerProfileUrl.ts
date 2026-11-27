import { departmentProfile } from '../services/departmentIdentity';
import type { RegistryIdentity } from '../services/registryAccountLink';

export type ProviderProfileRef = {
  state: string;
  source: 'registry' | 'neris' | 'state-ems' | 'regional-ems';
  id: string;
};

export function parseProviderProfileRef(value: string): ProviderProfileRef | undefined {
  const match = /^([A-Z]{2})\/(registry|neris|state-ems|regional-ems)\/([-a-zA-Z0-9.:_]{1,120})$/.exec(value);
  if (!match) return;
  const [, state, source, id] = match;
  if (source === 'registry' && !id.startsWith('usfa:' + state + ':') && !/^nppes:\d{10}$/.test(id)) return;
  if (source === 'neris' && !/^[-A-Z0-9]{1,14}$/i.test(id)) return;
  if (source === 'state-ems' && !(state === 'FL' ? /^\d{1,12}$/.test(id) : state === 'OH' && /^[-A-Z0-9]+$/i.test(id))) return;
  if (source === 'regional-ems' && !(state === 'TX'
    ? /^TX-DSHS:(license|registration):\d{6,7}$/.test(id)
    : state === 'NY' && /^NY-WREMSCO:row:\d{1,3}:[a-f0-9]{16}$/.test(id))) return;
  return departmentProfile({ state, source: source as ProviderProfileRef['source'], id });
}

export function providerProfileHref(ref: ProviderProfileRef): string {
  ref = departmentProfile(ref);
  return '?' + new URLSearchParams({ profile: [ref.state, ref.source, ref.id].join('/') });
}

export function registryProfileHref(identity: RegistryIdentity): string | undefined {
  const { stateCode: state, sourceName, identifier } = identity;
  const ref = sourceName === 'NERIS'
    ? { state, source: 'neris', id: identifier }
    : sourceName === 'State EMS'
    ? { state, source: 'state-ems', id: identifier }
    : { state, source: 'registry', id: sourceName === 'NPPES' ? 'nppes:' + identifier : 'usfa:' + state + ':' + identifier };
  const profile = parseProviderProfileRef([ref.state, ref.source, ref.id].join('/'));
  return profile && providerProfileHref(profile);
}
