#!/usr/bin/env python3
"""Replay-derived release report adapters; retained source archives stay unchanged.

The source selectors predate the combined release report's explicit physical
target field. This adapter binds negative evidence to the exact selected native
site using the unchanged selectors, and splits the grid selector's mixed
address-ambiguity/coordinate-reuse label. It never changes candidate eligibility.
"""
import argparse
import collections
import copy
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file
from address_normalization import normalize_street, source_street_line
from recover_neris_primary import (dump, load_departments, load_boundaries, source_objects,
    numbered_source_address, site_selection, direct_selection, distance)

PROFILES = ('mailing', 'website', 'grid', 'core-geocoded', 'mailing-geocoded', 'range', 'mailing-range')
QUALIFIED_NATIVE = {
    'source-county-disagreement', 'native-source-county-disagreement',
    'native-address-coordinate-disagreement', 'native-coordinate-disagreement',
    'coordinate-reused-across-distinct-addresses',
    'native-grid-source-county-disagreement', 'native-grid-coordinate-disagreement',
}

def native_reason(reason):
    for prefix in ('site-address-', 'site-'):
        if isinstance(reason, str) and reason.startswith(prefix):
            return reason[len(prefix):]
    return reason

@functools.lru_cache(maxsize=1)
def source_context():
    departments = load_departments()
    records, _ = source_objects(departments, load_boundaries())
    by_id = {row['object']['id']: row for row in records}
    by_address = collections.defaultdict(list)
    for row in records:
        address = row['address']
        if row['addressComponent']:
            by_address[(address['state'], normalize_street(source_street_line(address['street'])))].append(row)
    return {row['id']: row for row in departments}, by_id, by_address

def queried_site(department, objects):
    headquarters = objects[department['id']]
    if numbered_source_address(headquarters['address']):
        return headquarters
    if department['reportedStationCount'] == 1 and len(department['stations']) == 1:
        return objects[department['stations'][0]['id']]
    return None

def bind_native_rejection(row, original, department, objects, by_address, target=None):
    candidate, reason = site_selection(original, department, objects, {})
    if candidate:
        support, support_reason = direct_selection({**original, 'address': candidate['address']}, by_address)
        selected = [candidate['match']['latitude'], candidate['match']['longitude']]
        if not support or any(distance(selected, objects[native]['coordinates']) > 75
                              for native in support['corroboratingNativeIds']):
            candidate, reason = None, 'site-address-'+(support_reason or 'native-coordinate-disagreement')
    if candidate or reason != row.get('reason'):
        raise ValueError('Native negative report reason differs from its unchanged source selector')
    selected = queried_site(department, objects)
    result = copy.deepcopy(row)
    if selected is None:
        if native_reason(reason) in QUALIFIED_NATIVE:
            raise ValueError('Qualified native conflict lacks an actual queried physical site')
        if target is not None or row.get('targetAddress') is not None:
            raise ValueError('Unqueried native site cannot acquire an invented target address')
        result['releaseAddressBinding'] = {'basis': 'no-physical-hq-or-sole-station-was-queried'}
        return result
    address = selected['address']
    if target is not None and (target['originalPrimaryKey'] != original['key'] or target['address'] != address):
        raise ValueError('Frozen diagnostic target differs from the actual native site query')
    if row.get('targetAddress') is not None and row['targetAddress'] != address:
        raise ValueError('Retained native conflict target changed')
    result['originalPrimaryKey'] = original['key']
    result['targetAddress'] = copy.deepcopy(address)
    result['releaseAddressBinding'] = {
        'basis': 'replayed-native-hq-or-sole-selection',
        'nativeDepartmentId': department['id'], 'nativeSiteId': selected['object']['id'],
        'nativeObjectId': selected['object']['oid'], 'sourceKind': selected['kind'],
        'nativeAddressAsReported': copy.deepcopy(selected['object']['address']),
        'nativeAddressComponent': copy.deepcopy(selected['addressComponent']),
        'nativeCoordinatesAsReported': copy.deepcopy(selected['coordinates']),
        'nativePointIssue': selected['withheldReason'],
        'frozenDiagnosticTargetKey': target['key'] if target else None}
    return result

def split_grid_rejection(row, matching_records):
    if row.get('reason') != 'native-grid-coordinate-or-address-conflict':
        return copy.deepcopy(row)
    witnesses = [record for record in matching_records if record['withheldReason'] in
                 ('coordinate-reused-across-distinct-addresses', 'conflicting-native-address-lines')]
    if not witnesses:
        raise ValueError('Mixed grid rejection lacks its retained native cause')
    result = copy.deepcopy(row)
    result['retainedReason'] = result.pop('reason')
    result['reason'] = 'native-grid-source-evidence-withheld'
    result['reasons'] = sorted({record['withheldReason'] for record in witnesses})
    result['source'] = 'neris-grid'
    result['nativeConflictWitnesses'] = [{
        'nativeId': record['object']['id'], 'objectId': record['object']['oid'],
        'nativeAddressAsReported': copy.deepcopy(record['object']['address']),
        'nativeCoordinatesAsReported': copy.deepcopy(record['coordinates']),
        'reason': record['withheldReason']} for record in witnesses]
    return result

def expand_range_negative(row):
    result = copy.deepcopy(row)
    children = list(result.get('sourceConflicts') or [])
    for native in result.get('nativeConflicts', []):
        children.append({'source': 'neris', **copy.deepcopy(native)})
    selected = result.get('pointSelectionConflict')
    if selected is not None:
        children.append({'source': 'neris-independent-point-audit', **copy.deepcopy(selected)})
    if children:
        result['sourceConflicts'] = children
    return result

def read_profile(profile):
    if profile == 'mailing':
        from retain_neris_mailing_sites import EVIDENCE, validated_catalog
        report, targets, inputs, manifest = validated_catalog()
        return report, targets, inputs, manifest, EVIDENCE, 'candidates.json'
    if profile == 'website':
        from retain_neris_website_sites import EVIDENCE, validated_catalog
        report, targets, inputs, manifest = validated_catalog()
        return report, targets, inputs, manifest, EVIDENCE, 'report.json'
    if profile == 'grid':
        from retain_neris_grid_points import EVIDENCE, validated_catalog
        report, inputs, manifest = validated_catalog()
        return report, [], inputs, manifest, EVIDENCE, 'candidates.json'
    if profile == 'core-geocoded':
        from retain_neris_geocoded_sites import EVIDENCE, candidate_index
        candidate_index()
        manifest = json.loads((EVIDENCE/'manifest.json').read_bytes())
        with zipfile.ZipFile(EVIDENCE/'original.zip') as archive:
            report, targets, inputs = (json.loads(archive.read(name)) for name in
                                      ('candidates.json', 'inputs/targets.json', 'inputs/originals.json'))
        return report, targets, inputs, manifest, EVIDENCE, 'candidates.json'
    if profile == 'mailing-geocoded':
        from retain_neris_mailing_geocoded_sites import EVIDENCE, validated_catalog
        report, targets, inputs, manifest = validated_catalog()
        return report, targets, inputs, manifest, EVIDENCE, 'candidates.json'
    if profile in ('range', 'mailing-range'):
        from retain_neris_range_sites import evidence_directory, validated_catalog
        family = 'core' if profile == 'range' else 'mailing'
        report, targets, inputs, manifest = validated_catalog(family)
        return report, targets, inputs, manifest, evidence_directory(family), 'report.json'
    raise ValueError('Unknown retained NERIS release profile')

@functools.lru_cache(maxsize=len(PROFILES))
def _combined_release_report(profile):
    raw, targets, inputs, manifest, directory, member = read_profile(profile)
    if len(inputs['entries']) != 46791 or len({row['key'] for row in inputs['entries']}) != 46791:
        raise ValueError('Original primary denominator changed')
    if sha(dump(raw)) != manifest['members'][member]['sha256']:
        raise ValueError('Release negative adapter input differs from its retained source member')
    originals = {row['key']: row for row in inputs['entries']}
    by_target_key = {target['key']: target for target in targets}
    by_primary = {target['originalPrimaryKey']: target for target in targets}
    if len(by_target_key) != len(targets) or len(by_primary) != len(targets):
        raise ValueError('Native diagnostic identities are not reciprocal within their frozen scope')
    result = copy.deepcopy(raw)
    if profile in ('mailing', 'website'):
        departments, objects, address_index = source_context()
        bound = []
        for row in raw['rejected']:
            original = originals[row['key']]
            department = departments[row['nativeDepartmentId']]
            bound.append(bind_native_rejection(row, original, department, objects, address_index,
                                               by_primary.get(row['key'])))
        result['rejected'] = bound
    if profile == 'grid':
        from recover_neris_grid_points import source_records
        records, _ = source_records(load_departments(), load_boundaries())
        index = collections.defaultdict(list)
        for record in records:
            address = record['address']
            if record['addressComponent']:
                index[(address['state'], normalize_street(source_street_line(address['street'])), address['zip'])].append(record)
        replacements = {}
        for row in raw['rejected']:
            address = originals[row['key']]['address']
            if row.get('targetAddress') != address:
                raise ValueError('Grid negative does not bind the unchanged original primary address')
            key = (address['state'], normalize_street(source_street_line(address['street'])), address['zip'])
            replacements[row['key']] = split_grid_rejection(row, index.get(key, []))
        result['rejected'] = [replacements[row['key']] for row in raw['rejected']]
        for row in result.get('consensusVetoes', []):
            if 'native-grid-coordinate-or-address-conflict' in row.get('reasons', []):
                split = replacements[row['originalPrimaryKey']]
                row['retainedReasons'] = copy.deepcopy(row['reasons'])
                row['reasons'] = copy.deepcopy(split['reasons'])
                row['nativeConflictWitnesses'] = copy.deepcopy(split['nativeConflictWitnesses'])
    if profile in ('range', 'mailing-range'):
        result['rejected'] = [expand_range_negative(row) for row in raw['rejected']]
    bound_count = 0
    for field in ('rejected', 'withheld', 'originalAddressCoordinateConflicts', 'consensusVetoes'):
        for row in result.get(field, []):
            if not isinstance(row, dict):
                raise ValueError('Unstructured retained NERIS negative report')
            key = row.get('originalPrimaryKey') or row.get('primaryKey') or str(row.get('key', '')).split('@')[0]
            if key not in originals:
                raise ValueError('Negative evidence changes the original primary identity inventory')
            target = by_target_key.get(row.get('key'))
            address = row.get('targetAddress')
            if target is not None:
                if address is not None and address != target['address']:
                    raise ValueError('Negative evidence changed the exact diagnostic physical target')
                row['targetAddress'] = copy.deepcopy(target['address'])
            if isinstance(row.get('targetAddress'), dict):
                row['originalPrimaryKey'] = key
                bound_count += 1
    result['releaseNegativeAdapter'] = {
        'profile': profile, 'sourceArchiveSha256': manifest['archiveSha256'],
        'sourceMember': member, 'sourceReportSha256': manifest['members'][member]['sha256'],
        'adapterSha256': digest_file(pathlib.Path(__file__)),
        'candidateBytesUnchanged': dump(result.get('candidates', [])) == dump(raw.get('candidates', [])),
        'boundNegativeRowCount': bound_count,
        'scope': 'exact-retained-native-query-addresses-with-mixed-grid-reasons-split'}
    if not result['releaseNegativeAdapter']['candidateBytesUnchanged']:
        raise ValueError('Negative report adapter changed source candidates')
    return result

def combined_release_report(profile):
    """Return the complete source report with exactly replay-bound negatives."""
    return copy.deepcopy(_combined_release_report(profile))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', choices=PROFILES, action='append', required=True)
    parser.add_argument('--output-directory', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    for profile in args.profile:
        report = combined_release_report(profile)
        path = args.output_directory/(profile+'.json')
        path.write_bytes(dump(report))
        print(json.dumps({'profile': profile, 'reportSha256': sha(path.read_bytes()),
                          **report['releaseNegativeAdapter']}), flush=True)

if __name__ == '__main__':
    main()
