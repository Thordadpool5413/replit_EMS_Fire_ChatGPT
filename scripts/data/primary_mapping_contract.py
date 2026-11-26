"""Publication contract for retained primary-address and source-site evidence."""
import importlib
import math
from address_normalization import physical_address, normalize_street, normalized_city, source_street_line

METHODS = {'neris-reported-address', 'nad-address-point', 'usgs-structure-address',
           'hifld-ems-address', 'hifld-fire-address', 'overture-address',
           'overture-place-address', 'tiger-address-range'}
PROOFS = {
    'neris-department-geocoded-site-correlation': ('retain_neris_geocoded_sites', 'validate_geocoded_primary_entry'),
    'neris-department-mailing-site-correlation': ('retain_neris_mailing_sites', 'validate_mailing_primary_entry'),
    'neris-department-mailing-geocoded-site-correlation': ('retain_neris_mailing_geocoded_sites', 'validate_mailing_geocoded_primary_entry'),
    'neris-department-range-site-correlation': ('retain_neris_range_sites', 'validate_range_primary_entry'),
    'neris-department-mailing-range-site-correlation': ('retain_neris_range_sites', 'validate_range_primary_entry'),
    'neris-department-website-site-correlation': ('retain_neris_website_sites', 'validate_website_primary_entry'),
    'nppes-primary-address-components': ('recover_nppes_primary_components_extended', 'validate_nppes_extended_component_primary_entry'),
    'nppes-usfa-primary-site-correlation': ('recover_nppes_phone_sites', 'validate_nppes_phone_primary_entry'),
}


def rebuilt_entry(entry):
    match = entry.get('match') or {}
    point = match.get('point') or {}
    return bool(entry.get('primaryAddressEvidence') or match.get('sourceAddress') or
                match.get('sourceAddressProfile') or point.get('sourceArchiveSha256') or
                point.get('addressComponent') or
                match.get('method') in METHODS-{'neris-reported-address', 'nad-address-point'})


def address_correspondence(address, match):
    if not physical_address(address):
        return False
    source, basis = match.get('sourceAddress'), match.get('matchBasis')
    if match.get('method') == 'tiger-address-range':
        point = match.get('point') or {}
        return (source is None and basis == 'normalized-street-state-zip-and-house-number-range' and
                all(isinstance(point.get(key), str) for key in ('houseNumber', 'streetName', 'postalCode')) and
                match.get('matchedAddress') == point['houseNumber']+' '+point['streetName']+', '+address['state']+', '+point['postalCode'])
    if not isinstance(source, dict) or set(source) != {'street', 'city', 'state', 'zip'} or not all(isinstance(v, str) for v in source.values()):
        return False
    if source['state'] != address['state'] or normalize_street(source_street_line(source['street'])) != normalize_street(source_street_line(address['street'])):
        return False
    if match.get('matchedAddress') != ', '.join((source_street_line(source['street']), source['city'], source['state'], source['zip'])):
        return False
    city = normalized_city(source['city']) == normalized_city(address['city'])
    postal = source['zip'] == address['zip']
    if basis == 'normalized-street-city-state-zip':
        return city and postal
    if basis == 'normalized-street-state-zip':
        return postal
    if basis == 'normalized-street-city-state':
        return city and match['method'] in ('neris-reported-address', 'nad-address-point')
    return False


def validate_primary_entry(entry, national_row=None):
    match, county = entry.get('match'), entry.get('countyFips')
    if entry.get('status') != 'mapped' or not isinstance(match, dict):
        return False
    if entry.get('sourceCounty') and entry['sourceCounty'] != county:
        return False
    latitude, longitude = match.get('latitude'), match.get('longitude')
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (latitude, longitude)) or abs(latitude)>90 or abs(longitude)>180 or not (latitude or longitude):
        return False
    proof = entry.get('primaryAddressEvidence')
    if proof:
        if not isinstance(proof, dict):
            return False
        method = proof.get('method')
        if method == 'neris-department-site-correlation':
            from recover_neris_primary import validate_primary_evidence
            return validate_primary_evidence(proof, entry, national_row)
        if method not in PROOFS:
            return False
        module, validator = PROOFS[method]
        return bool(getattr(importlib.import_module(module), validator)(entry, national_row))
    profile = match.get('sourceAddressProfile')
    if profile == 'wi-mi-directional-grid-house-number':
        from retain_neris_grid_points import validate_grid_primary_entry
        return bool(validate_grid_primary_entry(entry, national_row))
    if profile == 'exact-street-city-state-native-postal-difference':
        from retain_federal_city_points import validate_federal_city_primary_entry
        return bool(validate_federal_city_primary_entry(entry, national_row))
    if profile is not None or match.get('method') not in METHODS or not address_correspondence(entry.get('address'), match):
        return False
    if match.get('point', {}).get('countyFips') != county:
        return False
    if match['method'] == 'neris-reported-address':
        from recover_neris_primary import validated_catalog
        candidates, originals, national = validated_catalog()
        candidate, original = candidates.get(entry['key']), originals.get(entry['key'])
        return bool(candidate and not candidate.get('primaryAddressEvidence') and original and
                    all(entry.get(k) == original.get(k) for k in ('key', 'name', 'state', 'source', 'sourceDate', 'sourceCounty', 'address')) and
                    all(entry.get(k) == candidate.get(k) for k in ('address', 'countyFips', 'match')) and
                    (national_row is None or national_row == national.get(entry['key'])))
    if match['method'] in ('usgs-structure-address', 'hifld-ems-address', 'hifld-fire-address'):
        from retain_federal_primary_points import validate_federal_primary_entry
        return validate_federal_primary_entry(entry)
    if match['method'] == 'nad-address-point':
        from stage_nad_primary import validate_nad_primary_entry
        return validate_nad_primary_entry(entry)
    if match['method'] == 'overture-address':
        from retain_overture_primary_addresses import validate_overture_primary_entry
        return validate_overture_primary_entry(entry)
    if match['method'] == 'overture-place-address':
        from retain_overture_primary_places import validate_overture_place_primary_entry
        return validate_overture_place_primary_entry(entry)
    if match['method'] == 'tiger-address-range':
        from retain_tiger_primary import validate_tiger_primary_entry
        return validate_tiger_primary_entry(entry)
    return False
