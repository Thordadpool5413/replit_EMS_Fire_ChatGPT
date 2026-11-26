#!/usr/bin/env python3
"""Join frozen NERIS site identities to separately validated address geocodes.

Native NERIS geometry remains visible in the proof. It is never relabeled as an
independent address geocode. All usable separate address sources are compared;
contradictory precise-source points and original county conflicts are withheld.
"""
import argparse
import collections
import copy
import json
import pathlib
import zipfile

from backfill_provider_locations import ROOT, sha
from address_normalization import physical_address, normalize_street, source_street_line, normalized_city
from recover_neris_primary import (dump, load_departments, load_boundaries, source_objects,
                                 matching_records, valid_point, distance, SOURCE_SHA, INDEX_SHA, NATIONAL_SHA)
from prepare_neris_independent_sites import prepare_original_batch
from retain_neris_primary import DEFAULT as PRIMARY_EVIDENCE
from primary_source_consensus import point_witnesses

TARGET_SHA = 'cb4c896b00f7ca2a1710a57a142f94e67b0e4463871e217ae9b1a8eeafe7744a'
METHOD = 'neris-department-geocoded-site-correlation'
SOURCE_METHODS = {'usgs': 'usgs-structure-address', 'hifld-ems': 'hifld-ems-address',
                  'hifld-fire': 'hifld-fire-address', 'nad': 'nad-address-point'}
REQUIRED_SOURCES = set(SOURCE_METHODS)
FEDERAL_COUNTS = {'usgs': 386823, 'hifld-ems': 42812, 'hifld-fire': 53087}
MAX_DISTANCE = 75


def load_target_inputs(path):
    raw = path.read_bytes()
    if sha(raw) != TARGET_SHA:
        raise ValueError('Frozen NERIS physical-site target variants changed')
    targets = json.loads(raw)
    with zipfile.ZipFile(PRIMARY_EVIDENCE/'original.zip') as archive:
        inputs = json.loads(archive.read('inputs.json'))
        approved = json.loads(archive.read('candidates.json'))
    # The target batch is frozen. Later conservative legacy audits may expose
    # additional unresolved records; those do not silently expand this batch.
    expected, counts = prepare_original_batch(inputs, approved, load_departments())
    if dump(expected) != raw or len(targets) != 1251 or len({t['originalPrimaryKey'] for t in targets}) != 1251:
        raise ValueError('NERIS target variants no longer reproduce their reciprocal native identity proof')
    return targets, inputs


def source_rows(source, report, targets_sha=TARGET_SHA, nad_diagnostic_count=1251):
    if source not in SOURCE_METHODS:
        raise ValueError('Unknown independent address source')
    if source == 'nad':
        from stage_nad_primary import ARCHIVE_SHA, SOURCE_COUNT
        if report.get('source') != 'nad-bulk-r24' or report.get('sourceArchiveSha256') != ARCHIVE_SHA or report.get('sourceCount') != SOURCE_COUNT or report.get('originalPrimaryCount') != 46791 or report.get('additionalDiagnosticTargets') != nad_diagnostic_count or not isinstance(report.get('rejected'), list):
            raise ValueError('NAD source report lacks complete frozen-target and conflict accounting')
        return report.get('diagnosticCandidates', [])
    if report.get('source') != source or report.get('baselineIndexSha256') != targets_sha or report.get('sourceStats', {}).get('completeRowsScanned') != FEDERAL_COUNTS[source] or report.get('sourceStats', {}).get('coordinateAuditRowsScanned') != FEDERAL_COUNTS[source]:
        raise ValueError('Independent source report is not a complete frozen-target audit')
    return report['candidates']


def point_matches_target(target, address, basis, source):
    if not physical_address(target) or not isinstance(address, dict) or any(not isinstance(address.get(k), str) for k in ('street', 'city', 'state', 'zip')):
        return False
    if target['state'] != address['state'] or normalize_street(source_street_line(target['street'])) != normalize_street(source_street_line(address['street'])):
        return False
    city = normalized_city(target['city']) == normalized_city(address['city'])
    postal = target['zip'] == address['zip'] and bool(address['zip'])
    return (basis == 'normalized-street-city-state-zip' and city and postal or
            basis == 'normalized-street-state-zip' and postal or
            source == 'nad' and basis == 'normalized-street-city-state' and city)


def collect_observations(targets, reports, targets_sha=TARGET_SHA, nad_diagnostic_count=1251):
    desired = {t['key']: t for t in targets}
    points = collections.defaultdict(list)
    vetoes = collections.defaultdict(list)
    summaries = {}
    for source, report in sorted(reports.items()):
        selected = source_rows(source, report, targets_sha, nad_diagnostic_count)
        seen = set()
        for candidate in selected:
            key = candidate['key']
            if key not in desired:
                if source == 'nad':
                    continue
                raise ValueError('Unexpected synthetic identity in independent source report')
            if key in seen:
                raise ValueError('Duplicate source candidate for one native site')
            seen.add(key)
            t = desired[key]
            m = candidate['match']
            if (candidate['address'] != t['address'] or candidate['originalAddress'] != t['address'] or
                    candidate.get('state', t['state']) != t['state'] or candidate.get('source', t['source']) != t['source'] or
                    m.get('method') != SOURCE_METHODS[source] or not point_matches_target(t['address'], m.get('sourceAddress'), m.get('matchBasis'), source) or
                    not valid_point([m.get('latitude'), m.get('longitude')]) or candidate['countyFips'] != m.get('point', {}).get('countyFips')):
                raise ValueError('Independent point is not bound to the exact native physical site address')
            if t.get('sourceCounty') and candidate['countyFips'] != t['sourceCounty']:
                raise ValueError('Independent point changes the original source county')
            points[key].append({'source': source, 'match': copy.deepcopy(m), 'countyFips': candidate['countyFips']})
        # Invalid/shared/missing points do not corroborate a location. Valid
        # contradictory coordinates and original county disagreements do veto
        # selection from another dataset at the same native site address.
        for rejected in report.get('rejected', []):
            key = rejected['key']
            reasons = set(rejected.get('reasons', []))
            consequential = reasons & {'independent-source-rows-disagree', 'primary-source-county-disagreement',
                                       'conflicting-native-points', 'original-source-county-disagreement', 'native-source-county-disagreement',
                                       'source-coordinate-shared-across-distinct-addresses',
                                       'coordinate-reused-across-distinct-addresses', 'nonactive-lifecycle'}
            if key in desired and consequential:
                vetoes[key].append({'source': source, **copy.deepcopy(rejected)})
        summaries[source] = {'method': SOURCE_METHODS[source], 'reportSha256': sha(dump(report)),
                             'sourceSha256': report.get('sourceSha256'), 'candidateCount': len(seen)}
    return points, vetoes, summaries


def native_index(departments):
    records, stats = source_objects(departments, load_boundaries())
    index = collections.defaultdict(list)
    for record in records:
        a = record['address']
        if record['addressComponent']:
            index[(a['state'], normalize_street(source_street_line(a['street'])))].append(record)
    return index


def selection_rank(point):
    source = point['source']
    precision = point['match']['point'].get('precision')
    return (precision == 'blockface', {'nad': 0, 'usgs': 1, 'hifld-ems': 2, 'hifld-fire': 3}[source],
            str(point['match']['point'].get('objectId', '')))


def generate(targets, inputs, reports, departments, targets_sha=TARGET_SHA, method=METHOD, nad_diagnostic_count=1251):
    points, source_vetoes, summaries = collect_observations(targets, reports, targets_sha, nad_diagnostic_count)
    originals = {r['key']: r for r in inputs['entries']}
    native = native_index(departments)
    candidates, withheld, consensus_vetoes = [], [], []
    outcomes = collections.Counter()
    for target in sorted(targets, key=lambda row: row['key']):
        key = target['key']
        observed = sorted(points.get(key, []), key=selection_rank)
        native_matches = matching_records(target, native)
        native_qualified = [record for record, _ in native_matches if not record['withheldReason']]
        native_issues = [record for record, _ in native_matches if record['withheldReason'] == 'coordinate-reused-across-distinct-addresses']
        if native_issues:
            source_vetoes[key].append({'source': 'neris', 'key': key, 'reasons': ['coordinate-reused-across-distinct-addresses'],
                                      'nativeIds': sorted(record['object']['id'] for record in native_issues)})
        if target.get('sourceCounty') and any(record['countyFips'] != target['sourceCounty'] for record in native_qualified):
            source_vetoes[key].append({'source': 'neris', 'key': key, 'reasons': ['native-source-county-disagreement'],
                                      'nativeIds': sorted(record['object']['id'] for record in native_qualified)})
        if source_vetoes.get(key):
            withheld.append({'key': key, 'originalPrimaryKey': target['originalPrimaryKey'],
                             'targetAddress': target['address'], 'reason': 'valid-independent-source-conflict', 'sourceConflicts': source_vetoes[key]})
            consensus_vetoes.extend({'originalPrimaryKey': target['originalPrimaryKey'], 'targetAddress': target['address'],
                                     'source': conflict['source'], 'reasons': conflict['reasons']} for conflict in source_vetoes[key])
            outcomes['valid-independent-source-conflict'] += 1
            continue
        if not observed:
            outcomes['no-independent-address-point'] += 1
            continue
        coords = [[p['match']['latitude'], p['match']['longitude']] for p in observed]
        endpoints = [point for observation in observed for point in point_witnesses(observation['match'], target['address'])]
        endpoints.extend({'method': 'neris-reported-address', 'latitude': record['coordinates'][0],
                          'longitude': record['coordinates'][1], 'countyFips': record['countyFips'],
                          'nativeId': record['object']['id']} for record in native_qualified)
        endpoint_coordinates = [[point['latitude'], point['longitude']] for point in endpoints]
        if (not endpoints or len({point['countyFips'] for point in endpoints}) != 1 or
                any(distance(a, b) > MAX_DISTANCE for i, a in enumerate(endpoint_coordinates) for b in endpoint_coordinates[i+1:])):
            withheld.append({'key': key, 'originalPrimaryKey': target['originalPrimaryKey'],
                             'targetAddress': target['address'], 'reason': 'independent-coordinate-disagreement', 'sourcePoints': observed,
                             'allQualifiedNativeEndpoints': endpoints})
            consensus_vetoes.append({'originalPrimaryKey': target['originalPrimaryKey'], 'targetAddress': target['address'],
                                     'source': 'neris-site-source-consensus', 'reasons': ['independent-coordinate-disagreement']})
            outcomes['independent-coordinate-disagreement'] += 1
            continue
        selected = observed[0]
        selected_coordinates = coords[0]
        original = originals[target['originalPrimaryKey']]
        proof = copy.deepcopy(target['primaryAddressEvidence'])
        proof.pop('diagnosticOnly')
        if proof['method'] != method or proof['sourceSha256'] != SOURCE_SHA or proof['nerisIndexSha256'] != INDEX_SHA or proof['nationalRegistrySha256'] != NATIONAL_SHA:
            raise ValueError('Unexpected frozen native identity proof')
        comparisons = []
        for record, basis in native_matches:
            obj = record['object']
            coordinate = record['coordinates']
            comparisons.append({'nativeId': obj['id'], 'objectId': obj['oid'],
                                'sourceKind': record['kind'], 'addressAsReported': copy.deepcopy(obj['address']),
                                'coordinatesAsReported': copy.deepcopy(coordinate),
                                'pointCountyFips': record['countyFips'], 'nativePointIssue': record['withheldReason'],
                                'selectedNativeSite': obj['id'] == proof['site']['id'],
                                'distanceToSelectedMeters': round(distance(coordinate, selected_coordinates), 6) if valid_point(coordinate) else None})
        if not any(r['selectedNativeSite'] for r in comparisons):
            raise ValueError('Selected native site is absent from the complete source-address comparison')
        for i, point in enumerate(observed):
            point['selected'] = i == 0
            point['distanceToSelectedMeters'] = round(distance(coords[i], selected_coordinates), 6)
        proof['geocoding'] = {'targetKey': key, 'targetsSha256': targets_sha,
                             'selectionBasis': 'separate-public-source-exact-native-site-address',
                             'nativeCoordinatesUsed': False, 'maximumIndependentSeparationMeters': MAX_DISTANCE,
                             'auditedSources': sorted(reports),
                             'sourceReportDigests': {source: metadata['reportSha256'] for source, metadata in summaries.items()},
                             'selectedCoordinates': selected_coordinates,
                             'sourceObservations': observed,
                             'allQualifiedNativeEndpoints': endpoints,
                             'nativeNerisObservations': sorted(comparisons, key=lambda row: row['nativeId'])}
        candidates.append({'key': original['key'], 'source': original['source'], 'state': original['state'],
                           'originalAddress': copy.deepcopy(original.get('address')), 'originalStatus': original['status'],
                           'address': copy.deepcopy(target['address']), 'countyFips': selected['countyFips'],
                           'match': copy.deepcopy(selected['match']), 'primaryAddressEvidence': proof})
        outcomes[proof['siteRole']] += 1
        outcomes['selected-' + selected['source']] += 1
        outcomes['native-coordinate-discrepancy-recorded'] += any(r['distanceToSelectedMeters'] is not None and r['distanceToSelectedMeters'] > MAX_DISTANCE for r in comparisons)
    return {'schemaVersion': 1, 'method': method, 'originalPrimaryIdentityCount': 46791,
            'targetVariantsSha256': targets_sha, 'targetVariantCount': len(targets),
            'completeRequiredSources': set(reports) == REQUIRED_SOURCES,
            'requiredSources': sorted(REQUIRED_SOURCES), 'sourceReports': summaries,
            'candidates': candidates, 'withheld': withheld, 'consensusVetoes': consensus_vetoes, 'outcomes': dict(sorted(outcomes.items())),
            'limitations': 'The department/site association remains inferred. Physical native NERIS addresses are separately geocoded; all native coordinates and discrepancies remain in the proof. HIFLD observations can share an originating dataset and are not independent votes. No operational status or rooftop accuracy is certified.'}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--targets', type=pathlib.Path, required=True)
    p.add_argument('--usgs-report', type=pathlib.Path, required=True)
    p.add_argument('--hifld-ems-report', type=pathlib.Path, required=True)
    p.add_argument('--hifld-fire-report', type=pathlib.Path, required=True)
    p.add_argument('--nad-report', type=pathlib.Path)
    p.add_argument('--output', type=pathlib.Path, required=True)
    args = p.parse_args()
    targets, inputs = load_target_inputs(args.targets)
    reports = {source: json.loads(getattr(args, source.replace('-', '_')+'_report').read_bytes())
               for source in SOURCE_METHODS if getattr(args, source.replace('-', '_')+'_report')}
    result = generate(targets, inputs, reports, load_departments())
    args.output.write_bytes(dump(result))
    print(json.dumps({'candidateCount': len(result['candidates']), 'completeRequiredSources': result['completeRequiredSources'],
                      'outcomes': result['outcomes'], 'withheld': len(result['withheld'])}), flush=True)


if __name__ == '__main__':
    main()
