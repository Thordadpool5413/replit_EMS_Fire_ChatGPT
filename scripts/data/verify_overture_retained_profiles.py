#!/usr/bin/env python3
"""Replay all retained Overture profiles together and audit every endpoint resolver."""
import copy
import json

import retain_overture_primary_addresses as addresses
import retain_overture_primary_places as places
import retain_overture_primary_variants as variants
from match_overture_primary_addresses import points_agree
from stage_overture_primary_addresses import encoded


def witness_identity(witness):
    return (witness['sourceFile'], witness['sourceRowNumber'], witness.get('sourceAddressOrdinal', -1))


def check_endpoints(candidate, reader):
    match=candidate['match'];address=candidate['originalAddress']
    witnesses=reader(match,address)
    if not witnesses:
        raise ValueError('Accepted source binding lost all native endpoints: '+candidate['key'])
    identities=[witness_identity(w) for w in witnesses]
    if len(identities)!=len(set(identities)):
        raise ValueError('Native endpoint resolver returned duplicate source rows')
    selected=[match['latitude'],match['longitude']]
    if selected not in [list(w['coordinatesAsReported']) for w in witnesses]:
        raise ValueError('Selected native source point missing from endpoint expansion: '+candidate['key'])
    if not points_agree([w['coordinatesAsReported'] for w in witnesses]):
        raise ValueError('Full native endpoint expansion exceeds the source consensus bound')
    changed=copy.deepcopy(match);changed['latitude']+=0.0001
    if reader(changed,address):
        raise ValueError('Mutated selected coordinate resolved to an accepted source binding')
    changed_address=copy.deepcopy(address);changed_address['street']='999999 UNBOUND SOURCE TEST ROAD'
    if reader(match,changed_address):
        raise ValueError('Unbound source address resolved to native endpoints')
    return len(witnesses)


def main():
    result={'ordinary':{},'variants':{}}
    readers={'overture-address':addresses,'overture-place-address':places}
    for method,module in readers.items():
        catalog=module.overture_primary_catalog()
        validate=module.validate_overture_primary_entry if method=='overture-address' else module.validate_overture_place_primary_entry
        endpoints=0;multiple=0
        for key,candidate in catalog['candidates'].items():
            original=catalog['targets'][key]
            entry=copy.deepcopy(original)
            entry.update(status='mapped',address=candidate['originalAddress'],countyFips=candidate['countyFips'],match=candidate['match'])
            if not validate(entry):
                raise ValueError('Retained ordinary entry failed exact runtime validation: '+key)
            count=check_endpoints(candidate,module.overture_coordinate_witnesses_for_match)
            endpoints+=count;multiple+=count>1
            changed=copy.deepcopy(entry);changed['match']['longitude']+=0.0001
            if validate(changed): raise ValueError('Ordinary entry accepted a changed native coordinate')
        result['ordinary'][method]={'candidates':len(catalog['candidates']),'nativeEndpoints':endpoints,'candidatesWithMultipleEndpoints':multiple,'reportSha256':catalog['reportSha256']}
    for method,module in readers.items():
        catalog=variants.overture_diagnostic_catalog(method)
        counts={};endpoints=0;multiple=0;rejected={}
        for key,candidate in catalog['candidates'].items():
            target=catalog['targets'][key]
            if not variants.validate_overture_diagnostic_candidate(candidate,target):
                raise ValueError('Native variant exact target binding failed: '+key)
            label='cms-primary-component' if 'componentEvidence' in target else 'neris-native-site'
            counts[label]=counts.get(label,0)+1
            count=check_endpoints(candidate,module.overture_coordinate_witnesses_for_match)
            direct=variants.overture_diagnostic_witnesses_for_match(candidate['match'],candidate['originalAddress'])
            delegated=module.overture_coordinate_witnesses_for_match(candidate['match'],candidate['originalAddress'])
            if {witness_identity(w) for w in direct}!={witness_identity(w) for w in delegated}:
                raise ValueError('Ordinary wrapper omitted or added native variant endpoints')
            endpoints+=count;multiple+=count>1
        for row in catalog['rejected']:
            target=catalog['targets'][row['key']]
            if encoded(row['targetAddress'])!=encoded(target['address']):
                raise ValueError('Rejected native variant lost exact target address scope')
            label='cms-primary-component' if 'componentEvidence' in target else 'neris-native-site'
            group=rejected.setdefault(label,{})
            group[row['reason']]=group.get(row['reason'],0)+1
        result['variants'][method]={'candidates':len(catalog['candidates']),'byTargetRole':counts,'nativeEndpoints':endpoints,'candidatesWithMultipleEndpoints':multiple,'rejectedByTargetRole':rejected,'uncertain':len(catalog['uncertain']),'reportSha256':catalog['reportSha256']}
    print(json.dumps(result,indent=2,sort_keys=True))


if __name__=='__main__': main()
