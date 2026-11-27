import type { ProviderProfileRef } from '../navigation/providerProfileUrl';
import { getEmsJurisdictionSourceCoverage } from '../data/stateEmsSourceCoverage';
import { addressText, addressMatchLabel } from './providerLocationContract';
import { floridaRegistryIdentity, loadFloridaRoster } from './floridaEmsRoster';
import { enrichRegistryRow, listingLocation, LISTING_LOCATION_LABELS, loadNationalLocationState, primaryAssociationLabel, providerProfileCountyFips } from './nationalLocationSnapshot';
import { loadSourceDirectoryManifest, loadSourceDirectoryState } from './nationalSourceDirectory';
import { loadNerisStateCatalog, nerisAddressText, nerisObjectUrl } from './nerisStationCatalog';
import { registryIdentityLabel, registryIdentityKey, snapshotRegistryIdentity, type RegistryIdentity } from './registryAccountLink';
import { loadTexasReviewRoster } from './texasEmsReviewRoster';
import { loadWestchesterCatalog } from './westchesterEmsReview';
import { loadOhioRoster, ohioRegistryIdentity } from './stateEmsRoster';

export type PublicProviderProfile = {
  name: string;
  kind: 'Fire department' | 'EMS organization';
  state: string;
  stateCode: string;
  city?: string;
  county?: string;
  countyFips?: string;
  locationNote?: string;
  reportedStationCount?: number | null;
  stationCountSource?: string;
  address?: string;
  recordedAddress?: string;
  addressSource?: { label: string; url: string };
  locationLabel?: string;
  directionsUrl?: string;
  source: { name: string; url: string; date?: string | null };
  identifier: string;
  registryKey?: string;
  identity?: RegistryIdentity;
};

function fromIdentity(identity: RegistryIdentity): PublicProviderProfile {
  return {
    name: identity.name,
    kind: identity.sourceName === 'USFA NFDR' || identity.sourceName === 'NERIS' ? 'Fire department' : 'EMS organization',
    state: getEmsJurisdictionSourceCoverage(identity.stateCode)?.name ?? identity.stateCode,
    stateCode: identity.stateCode,
    city: identity.city,
    county: identity.countyName,
    countyFips: identity.countyFips,
    address: identity.address,
    source: { name: identity.sourceAuthority ?? identity.sourceName, url: identity.sourceUrl, date: identity.sourceDate },
    identifier: registryIdentityLabel(identity),
    registryKey: registryIdentityKey(identity),
    identity,
  };
}

export async function loadPublicProviderProfile(ref: ProviderProfileRef): Promise<PublicProviderProfile | undefined> {
  const jurisdiction = getEmsJurisdictionSourceCoverage(ref.state);
  if (!jurisdiction || jurisdiction.level === 'territory') return;

  if (ref.source === 'neris') {
    const catalog = await loadNerisStateCatalog(ref.state);
    const row = catalog.departments.find((record) => record.id === ref.id);
    if (!row) return;
    const profile = fromIdentity({
      sourceName: 'NERIS', sourceAuthority: 'USFA NERIS', identifier: row.id, name: row.name,
      stateCode: row.state, city: row.address[2] ?? undefined, address: nerisAddressText(row.address),
      sourceUrl: nerisObjectUrl(0, row.oid), retrievedAt: catalog.retrievedAt,
      sourceDate: row.exportDate === null ? null : new Date(row.exportDate).toISOString().slice(0, 10),
    });
    return { ...profile, reportedStationCount: row.reportedStationCount, stationCountSource: 'NERIS' };
  }

  if (ref.source === 'regional-ems') {
    if (ref.state === 'TX') {
      const roster = await loadTexasReviewRoster();
      const row = roster.records.find((record) => record.sourceKey === ref.id);
      if (!row) return;
      return {
        name: row.name, kind: 'EMS organization', state: jurisdiction.name, stateCode: ref.state,
        address: [row.addressAsReported, row.mailingAddress2, row.city, row.state, row.zip].filter(Boolean).join(', '),
        locationLabel: 'Mailing location reported by Texas DSHS. Physical operating county is unresolved.',
        identifier: (row.rosterKind === 'provider' ? 'State EMS license ' : 'First responder registration ') + row.identifier,
        reportedStationCount: row.stationCountAsReported, stationCountSource: 'Texas DSHS',
        source: { name: 'Texas DSHS source roster', url: roster.sources[row.rosterKind].sourceUrl, date: 'Retrieved ' + roster.retrievedAt },
      };
    }
    const roster = await loadWestchesterCatalog();
    const row = roster.records.find((record) => record.reviewKey === ref.id);
    if (!row) return;
    return {
      name: row.name, kind: 'EMS organization', state: jurisdiction.name, stateCode: ref.state,
      address: [row.headquartersStreetAsReported, row.cityAsReported, row.stateAsReported, row.postalCodeAsReported].filter(Boolean).join(', '),
      locationLabel: 'Headquarters as reported by the regional council. Physical operating county is unresolved.',
      identifier: row.agencyCodeAsReported ? 'Reported agency code ' + row.agencyCodeAsReported : 'Regional directory listing',
      source: { name: 'Westchester Regional EMS Council', url: roster.sourceUrl, date: 'Retrieved ' + roster.retrievedAt.slice(0, 10) },
    };
  }

  if (ref.source === 'state-ems') {
    if (ref.state === 'OH') {
      const roster = await loadOhioRoster();
      const row = roster.records.find((entry) => entry.identifier === ref.id);
      return row ? fromIdentity(ohioRegistryIdentity(roster, row)) : undefined;
    }
    const [roster, manifest] = await Promise.all([loadFloridaRoster(), loadSourceDirectoryManifest()]);
    const row = roster.records.find((entry) => entry.identifier === ref.id);
    if (!row) return;
    const identity = floridaRegistryIdentity(roster, row, new Map(Object.entries(manifest.countyNames)));
    return identity ? fromIdentity(identity) : undefined;
  }

  const [manifest, records, locations] = await Promise.all([
    loadSourceDirectoryManifest(), loadSourceDirectoryState(ref.state), loadNationalLocationState(ref.state),
  ]);
  const row = records.find((record) => record[0] === ref.id);
  if (!row) return;
  const [ , source, name, stateCode, city, , , , , deactivation, street, sourceUrl ] = row;
  const sourceDate = source === 'USFA' ? manifest.sources.USFA.retrievedAt : manifest.sources.NPPES.reportingPeriod;
  const identity = snapshotRegistryIdentity(row, sourceDate);
  const location = listingLocation(row, locations);
  const enriched = enrichRegistryRow(row, locations);
  const acceptedSite = location.status === 'mapped' ? location.address : null;
  const resolvedKey = identity && registryIdentityKey(identity);
  const countyFips = providerProfileCountyFips(row, locations, location);
  const address = acceptedSite ? addressText(acceptedSite) : street || (location.address ? addressText(location.address) : undefined);
  const proof = location.primaryAddressEvidence;
  return {
    name, state: jurisdiction.name, stateCode, city: acceptedSite?.city ?? (enriched[4] || city),
    kind: source === 'USFA' ? 'Fire department' : 'EMS organization',
    county: countyFips ? manifest.countyNames[countyFips] : undefined,
    countyFips: countyFips || undefined,
    locationNote: proof ? primaryAssociationLabel(proof) : undefined,
    address,
    recordedAddress: proof?.originalAddress ? addressText(proof.originalAddress) : undefined,
    addressSource: location.officialAddressEvidence
      ? { label: location.officialAddressEvidence.authority, url: location.officialAddressEvidence.sourceUrl }
      : undefined,
    locationLabel: location.match && location.status === 'mapped'
      ? addressMatchLabel(location.match)
      : deactivation ? 'NPI deactivation reported ' + deactivation : LISTING_LOCATION_LABELS[location.status],
    directionsUrl: acceptedSite ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText(acceptedSite)) : undefined,
    source: { name: source === 'USFA' ? 'USFA Fire Department Registry' : 'CMS NPPES', url: identity?.sourceUrl ?? (source === 'USFA' ? 'https://apps.usfa.fema.gov/registry/search' : sourceUrl), date: sourceDate },
    identifier: identity ? registryIdentityLabel(identity) : 'FDID unavailable',
    registryKey: resolvedKey,
    identity,
  };
}
