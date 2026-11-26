#!/usr/bin/env python3
"""Reciprocal native website identities with complete city/ZIP and actual site roles."""
import argparse
import collections
import copy
import json
import pathlib
from backfill_provider_locations import native_key, sha
from address_normalization import normalize_street, source_street_line
from recover_neris_primary import dump, load_departments, load_boundaries, source_objects, direct_selection, site_selection, distance
from recover_neris_mailing_sites import source_inputs, diagnostic_target
from retain_neris_mailing_source import source_catalog as neris_source_catalog, SOURCE as NERIS_MAILING_SHA
from retain_usfa_native_source import source_catalog as usfa_source_catalog, SOURCE_SHA as USFA_SHA
from retain_neris_mailing_sites import validated_catalog as mailing_catalog
from neris_website_identity import identity_indices, correlate

METHOD = 'neris-department-website-site-correlation'
DIAGNOSTIC_METHOD = 'neris-department-website-geocoded-site-correlation'


def generate(inputs, core, mailing, departments, supplement, usfa, boundaries):
    if len(inputs['entries']) != 46791 or len({row['key'] for row in inputs['entries']}) != 46791:
        raise ValueError('Original primary identity denominator changed')
    if len(supplement['features']) != 30700 or usfa['completeLogicalSourceRows'] != 27117 or usfa['parsedRows']+usfa['quarantinedRows'] != 27117:
        raise ValueError('Complete native website identity source inventory changed')
    indices = identity_indices(supplement, usfa)
    department_index = {row['oid']: row for row in departments}
    national_groups = collections.defaultdict(list)
    for row in inputs['nationalRows']:
        key = native_key(row)
        if row[1] == 'USFA' and key: national_groups[key].append(row)
    source, stats = source_objects(departments, boundaries)
    objects = {row['object']['id']: row for row in source}; address_index = collections.defaultdict(list)
    for row in source:
        a = row['address']
        if row['addressComponent']: address_index[(a['state'], normalize_street(source_street_line(a['street'])))].append(row)
    accepted = {row['key'] for row in core['candidates']} | {row['key'] for row in mailing['candidates']}
    accepted.update(row['key'] for row in core['legacyAudit'] if row['accepted'])
    withheld_legacy = {row['key'] for row in core['legacyAudit'] if not row['accepted']}
    candidates, targets, rejected, lower_locality, vetoes = [], [], [], [], []
    outcomes = collections.Counter()
    for entry in sorted(inputs['entries'], key=lambda row: row['key']):
        if (entry['source'] != 'USFA' or entry['key'] in accepted or entry['status'] in ('historical', 'review') or
                entry['status'] == 'mapped' and entry['key'] not in withheld_legacy or len(national_groups.get(entry['key'], [])) != 1):
            continue
        original = national_groups[entry['key']][0]
        if original[2] != entry['name'] or original[3] != entry['state'] or original[6] != entry.get('sourceCounty', ''):
            raise ValueError('Original primary changed its retained native national metadata')
        pair, reason = correlate(entry, original, indices, department_index)
        if not pair:
            outcomes[reason] += 1
            if reason == 'website-identity-lacks-complete-native-city-and-zip':
                lower_locality.append({'key': entry['key'], 'reason': reason, 'publicationEligible': False})
            continue
        department, correlation = pair
        candidate, reason = site_selection(entry, department, objects, correlation)
        if candidate:
            support, support_reason = direct_selection({**entry, 'address': candidate['address']}, address_index)
            selected = [candidate['match']['latitude'], candidate['match']['longitude']]
            if not support or any(distance(selected, objects[native_id]['coordinates'])>75 for native_id in support['corroboratingNativeIds']):
                candidate, reason = None, 'site-address-'+(support_reason or 'native-coordinate-disagreement')
        if candidate:
            candidate.update(source=entry['source'], state=entry['state'], originalStatus=entry['status'])
            candidate['primaryAddressEvidence'].update(method=METHOD, mailingSourceSha256=NERIS_MAILING_SHA,
                usfaNativeSourceSha256=USFA_SHA, originalMappingWithheld=entry['key'] in withheld_legacy)
            candidates.append(candidate); outcomes[correlation['websiteBasis']] += 1
            continue
        target = diagnostic_target(entry, department, correlation, reason, withheld_legacy)
        if target:
            target['key'] = entry['key']+('@NERIS-WEBSITE-HQ' if target['primaryAddressEvidence']['siteRole']=='reported-headquarters' else '@NERIS-WEBSITE-SOLE')
            target['primaryAddressEvidence'].update(method=DIAGNOSTIC_METHOD, usfaNativeSourceSha256=USFA_SHA)
            targets.append(target)
            if any(token in (reason or '') for token in ('county-disagreement', 'coordinate-disagreement', 'coordinate-reused', 'conflicting-native-address')):
                vetoes.append({'originalPrimaryKey': entry['key'], 'targetAddress': target['address'], 'source': 'neris-website-native-site', 'reasons': [reason]})
        rejected.append({'key': entry['key'], 'reason': reason, 'nativeDepartmentId': department['id'],
                         'targetAddress': target['address'] if target else None})
        outcomes['independent-native-site-target' if target else 'no-unambiguous-native-site'] += 1
    targets.sort(key=lambda row: row['key'])
    return {'schemaVersion': 1, 'method': METHOD, 'scope': 'additional-unresolved-after-core-and-mailing-native',
            'excludedAlreadyQualifiedNativeKeyCount': len(accepted), 'excludedAlreadyQualifiedNativeKeysSha256': sha(dump(sorted(accepted))),
            'originalPrimaryIdentityCount': 46791,
            'nativeNerisInventoryCount': 30700, 'completeNativeUsfaSourceRows': 27117,
            'mailingSourceSha256': NERIS_MAILING_SHA, 'usfaNativeSourceSha256': USFA_SHA,
            'candidates': candidates, 'diagnosticTargets': targets, 'diagnosticTargetsSha256': sha(dump(targets)),
            'withheldLowerLocalityCorroboration': lower_locality, 'rejected': rejected, 'consensusVetoes': vetoes,
            'outcomes': dict(sorted(outcomes.items())), 'sourceStats': stats,
            'limitations': 'Complete native website fields establish only a reciprocal inferred agency identity, corroborated by the complete agency name and native city plus ZIP. Coordinates and HQ/sole role remain native-source claims. Website ownership, current operating status and building accuracy are not certified.'}


def reproduce():
    mailing, _, inputs, _ = mailing_catalog()
    _, core = source_inputs(); supplement, _ = neris_source_catalog(); usfa, _ = usfa_source_catalog()
    return generate(inputs, core, mailing, load_departments(), supplement, usfa, load_boundaries()), inputs


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--targets', type=pathlib.Path); args = parser.parse_args()
    report, _ = reproduce(); args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_bytes(dump(report))
    if args.targets: args.targets.parent.mkdir(parents=True, exist_ok=True); args.targets.write_bytes(dump(report['diagnosticTargets']))
    print(json.dumps({'candidateCount': len(report['candidates']), 'targetCount': len(report['diagnosticTargets']),
                      'lowerLocalityHeld': len(report['withheldLowerLocalityCorroboration']), 'outcomes': report['outcomes']}), flush=True)

if __name__ == '__main__':
    main()
