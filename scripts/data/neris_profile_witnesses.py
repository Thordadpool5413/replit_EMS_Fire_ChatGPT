"""Complete qualified NERIS endpoint observations for inferred physical sites."""
import collections
import functools
from address_normalization import normalize_street, source_street_line
from recover_neris_primary import source_objects, load_departments, load_boundaries, matching_records, make_match, distance

QUALIFIED_NATIVE_ISSUES = {'coordinate-reused-across-distinct-addresses', 'native-parent-name-conflict',
                          'conflicting-native-address-lines'}


@functools.lru_cache(maxsize=1)
def native_address_index():
    records, _ = source_objects(load_departments(), load_boundaries())
    index = collections.defaultdict(list)
    for record in records:
        address = record['address']
        if record['addressComponent']:
            index[(address['state'], normalize_street(source_street_line(address['street'])))].append(record)
    return index


def native_witnesses(address):
    return [{'match': make_match(record, basis), 'targetAddress': address,
             'countyFips': record['countyFips']}
            for record, basis in matching_records({'address': address}, native_address_index())
            if not record['withheldReason']]


def native_vetoes(address, source_county=''):
    matches = matching_records({'address': address}, native_address_index())
    result = []
    eligible = [record for record, _ in matches if not record['withheldReason']]
    for record, _ in matches:
        reason = record['withheldReason']
        if reason in QUALIFIED_NATIVE_ISSUES:
            result.append({'nativeId': record['object']['id'], 'objectId': record['object']['oid'], 'reason': reason})
        if not reason and source_county and record['countyFips'] != source_county:
            result.append({'nativeId': record['object']['id'], 'objectId': record['object']['oid'],
                           'reason': 'native-source-county-disagreement', 'countyFips': record['countyFips']})
    if (len({record['countyFips'] for record in eligible}) > 1 or
            any(distance(a['coordinates'], b['coordinates']) > 75 for i, a in enumerate(eligible) for b in eligible[i+1:])):
        result.append({'reason': 'native-address-coordinate-disagreement',
                       'nativeIds': sorted(record['object']['id'] for record in eligible)})
    return result
