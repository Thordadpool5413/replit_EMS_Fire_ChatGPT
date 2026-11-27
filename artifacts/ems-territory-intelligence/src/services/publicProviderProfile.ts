import { hasProviderServiceName } from './providerServiceName';
import { loadNpiDetails, loadHeadquartersCounties } from './providerRegistryDetails';
import type { ProviderProfileRef } from '../navigation/providerProfileUrl';
import { getEmsJurisdictionSourceCoverage } from '../data/stateEmsSourceCoverage';
import { addressText, addressMatchLabel } from './providerLocationContract';
import { floridaServiceName, floridaRegistryIdentity, loadFloridaRoster } from './floridaEmsRoster';
import { enrichRegistryRow, listingLocation, LISTING_LOCATION_LABELS, loadNationalLocationState, primaryAssociationLabel, providerProfileCountyFips } from './nationalLocationSnapshot';
import { loadSourceDirectoryManifest, loadSourceDirectoryState } from './nationalSourceDirectory';
import { loadNerisStateCatalog, nerisAddressText, nerisObjectUrl } from './nerisStationCatalog';
import { registryIdentityLabel, registryIdentityKey, snapshotRegistryIdentity, type RegistryIdentity } from './registryAccountLink';
import { loadTexasReviewRoster, texasServiceName } from './texasEmsReviewRoster';
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
  withholdGeography?: boolean;
  zip?: string;
  registryFields?: { label: string; value: string }[];
  reportedStationCount?: number | null;
  stationCountSource?: string;
  address?: string;
  recordedAddress?: string;
  mappedAddress?: string;
  addressSource?: { label: string; url: string };
  locationLabel?: string;
  coordinates?: { latitude: number; longitude: number };
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
    city: identity.city, zip: identity.postalCode,
    county: identity.countyName,
    countyFips: identity.countyFips,
    address: identity.address,
    source: { name: identity.sourceAuthority ?? identity.sourceName, url: identity.sourceUrl, date: identity.sourceDate },
    identifier: registryIdentityLabel(identity),
    registryKey: registryIdentityKey(identity),
    identity,
  };
}

function fields(rows: [string, string | null | undefined][]) {
  return rows.flatMap(([label,value]) => value?.trim() ? [{label,value}] : []);
}

export async function loadPublicProviderProfile(ref: ProviderProfileRef): Promise<PublicProviderProfile | undefined> {
  const jurisdiction = getEmsJurisdictionSourceCoverage(ref.state);
  if (!jurisdiction || jurisdiction.level === 'territory') return;

  if (ref.source === 'neris') {
    const [catalog, headquarters, manifest] = await Promise.all([loadNerisStateCatalog(ref.state), loadHeadquartersCounties(), loadSourceDirectoryManifest()]);
    const row = catalog.departments.find((record) => record.id === ref.id);
    if (!row) return;
    const profile = fromIdentity({
      sourceName: 'NERIS', sourceAuthority: 'USFA NERIS', identifier: row.id, name: row.name,
      stateCode: row.state, city: row.address[2] ?? undefined, address: nerisAddressText(row.address),
      sourceUrl: nerisObjectUrl(0, row.oid), retrievedAt: catalog.retrievedAt,
      sourceDate: row.exportDate === null ? null : new Date(row.exportDate).toISOString().slice(0, 10),
    });
    const countyFips = headquarters[row.id];
    return { ...profile, reportedStationCount: row.reportedStationCount, stationCountSource: 'NERIS',
      countyFips, county: manifest.countyNames[countyFips], zip: row.address[4] ?? undefined,
      coordinates: countyFips && row.coordinates ? {latitude: row.coordinates[0], longitude: row.coordinates[1]} : undefined,
      locationLabel: 'NERIS reported headquarters', registryFields: fields([['Department type',row.departmentType],['Entity type',row.entityType]]) };
  }

  if (ref.source === 'regional-ems') {
    if (ref.state === 'TX') {
      const roster = await loadTexasReviewRoster();
      const row = roster.records.find((record) => record.sourceKey === ref.id);
      if (!row) return;
      return {
        name: texasServiceName(row) ?? row.name, kind: 'EMS organization', state: jurisdiction.name, stateCode: ref.state,
        city: row.city ?? undefined, zip: row.zip, registryKey: row.sourceKey,
        registryFields: fields([['Legal name',row.name],['Operating name',row.dbaName],['License type',row.licenseType],['License rank',row.licenseRankAsReported],['Roster status',row.status],['Secondary status',row.secondaryStatus],['Issued',row.issuedOn],['Expires',row.expiresOn],['Rank date',row.rankDateAsReported],['Mailing county',row.mailingCounty],['Date review',row.licenseDateConflict ? 'Source license dates conflict' : null]]),
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
      city: row.cityAsReported ?? undefined, zip: row.postalCodeAsReported ?? undefined, registryKey: row.reviewKey,
      registryFields: fields([['Regional agency code',row.agencyCodeAsReported],['Code status',row.agencyCodeStatus]]),
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
    const [roster, manifest, locations] = await Promise.all([loadFloridaRoster(), loadSourceDirectoryManifest(), loadNationalLocationState('FL')]);
    const row = roster.records.find((entry) => entry.identifier === ref.id);
    if (!row || !floridaServiceName(row)) return;
    const identity = floridaRegistryIdentity(roster, row, new Map(Object.entries(manifest.countyNames)));
    if (!identity) return;
    const profile = fromIdentity(identity);
    const entry = locations?.entries.get('STATE-EMS:FL:license:' + row.identifier);
    if (entry?.status === 'mapped' && entry.match && profile.countyFips && entry.countyFips === profile.countyFips && entry.address?.street.trim().toLowerCase() === row.address.trim().toLowerCase()) {
      profile.coordinates = {latitude:entry.match.latitude,longitude:entry.match.longitude};
      profile.locationLabel = addressMatchLabel(entry.match);
    }
    return profile;
  }

  const [manifest, records, locations] = await Promise.all([
    loadSourceDirectoryManifest(), loadSourceDirectoryState(ref.state), loadNationalLocationState(ref.state),
  ]);
  const row = records.find((record) => record[0] === ref.id);
  if (!row) return;
  const [ , source, name, stateCode, city, , , , , deactivation, street, sourceUrl ] = row;
  const billing = source === 'NPPES' ? (await loadNpiDetails(ref.state)).get(ref.id.slice(6)) : undefined;
  const operatingName = billing?.alternateName && hasProviderServiceName(billing.alternateName) ? billing.alternateName : name;
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
    name: operatingName, zip: acceptedSite?.zip ?? row[5], state: jurisdiction.name, stateCode,
    registryFields: billing ? fields([['Registered name',billing.legalName],['Other organization name',billing.alternateName],['Registered taxonomies',billing.taxonomies.join(', ')],['NPPES updated',billing.sourceUpdatedAt],['NPI deactivated',billing.deactivationDate],['NPI reactivated',billing.reactivationDate]]) : undefined,
    city: acceptedSite?.city ?? (enriched[4] || city),
    kind: source === 'USFA' ? 'Fire department' : 'EMS organization',
    county: countyFips ? manifest.countyNames[countyFips] : undefined,
    countyFips: countyFips || undefined,
    locationNote: proof ? primaryAssociationLabel(proof) : undefined,
    address,
    withholdGeography: location.status === 'review' || location.status === 'historical',
    recordedAddress: proof?.originalAddress ? addressText(proof.originalAddress) : undefined,
    addressSource: location.officialAddressEvidence
      ? { label: location.officialAddressEvidence.authority, url: location.officialAddressEvidence.sourceUrl }
      : undefined,
    locationLabel: location.match && location.status === 'mapped'
      ? addressMatchLabel(location.match)
      : deactivation ? 'NPI deactivation reported ' + deactivation : LISTING_LOCATION_LABELS[location.status],
    coordinates: acceptedSite && location.match ? { latitude: location.match.latitude, longitude: location.match.longitude } : undefined,
    directionsUrl: acceptedSite ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText(acceptedSite)) : undefined,
    source: { name: source === 'USFA' ? 'USFA Fire Department Registry' : 'CMS NPPES', url: identity?.sourceUrl ?? (source === 'USFA' ? 'https://apps.usfa.fema.gov/registry/search' : sourceUrl), date: sourceDate },
    identifier: identity ? registryIdentityLabel(identity) : 'FDID unavailable',
    registryKey: resolvedKey,
    identity,
  };
}
