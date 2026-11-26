#!/usr/bin/env python3
"""Truthful interpolated road locations for source-bound NERIS physical sites."""
import collections
import copy
import json
import zipfile
from backfill_provider_locations import ROOT, sha
from recover_neris_primary import dump, load_departments, matching_records
from recover_neris_geocoded_sites import collect_observations, native_index
from neris_profile_witnesses import native_vetoes
from retain_neris_geocoded_sites import EVIDENCE as CORE_POINTS, verify as verify_core_points
from retain_neris_mailing_geocoded_sites import EVIDENCE as MAIL_POINTS, validated_catalog as mailing_point_catalog

CORE_METHOD = 'neris-department-range-site-correlation'
MAILING_METHOD = 'neris-department-mailing-range-site-correlation'


def point_audits(family):
    if family == 'core':
        verify_core_points(CORE_POINTS); directory = CORE_POINTS
    elif family == 'mailing':
        mailing_point_catalog(); directory = MAIL_POINTS
    else:
        raise ValueError('Unknown NERIS range identity family')
    with zipfile.ZipFile(directory/'original.zip') as archive:
        targets = json.loads(archive.read('inputs/targets.json'))
        inputs = json.loads(archive.read('inputs/originals.json'))
        report = json.loads(archive.read('candidates.json'))
        sources = report['requiredSources']
        reports = {source: json.loads(archive.read('reports/'+source+'.json')) for source in sources}
    expected_sources = {'usgs', 'hifld-ems', 'hifld-fire', 'nad'} | ({'overture'} if family == 'mailing' else set())
    if not report.get('completeRequiredSources') or set(sources) != expected_sources:
        raise ValueError('Complete point-source audits are required before range fallback')
    return targets, inputs, reports, report, directory


def generate(family, targets, inputs, reports, point_report, tiger_report):
    from retain_tiger_primary import validate_tiger_diagnostic_candidate
    method = CORE_METHOD if family == 'core' else MAILING_METHOD
    scope = 'neris-native' if family == 'core' else 'additional-native'
    target_sha = sha(dump(targets))
    if target_sha != point_report['targetVariantsSha256']:
        raise ValueError('Range fallback point-audit scope changed')
    observed, vetoes, summaries = collect_observations(targets, reports, target_sha, len(targets)+(609 if family == 'mailing' else 0))
    tiger_candidates = {}
    for candidate in tiger_report['diagnosticCandidates']:
        if candidate['scope'] == scope:
            key = candidate['key']
            if key in tiger_candidates: raise ValueError('Duplicate native site range candidate')
            tiger_candidates[key] = candidate
    original = {entry['key']: entry for entry in inputs['entries']}
    native = native_index(load_departments())
    candidates, rejected, consensus_vetoes = [], [], []
    outcomes = collections.Counter()
    point_withholds = {row['key']: row for row in point_report['withheld']}
    for target in sorted(targets, key=lambda row: row['key']):
        key = target['key']
        native_issues = native_vetoes(target['address'], target.get('sourceCounty', ''))
        native_matches = matching_records(target, native)
        qualified_native = [record for record, _ in native_matches if not record['withheldReason']]
        reason = None
        if vetoes.get(key) or native_issues or key in point_withholds:
            reason = 'qualified-point-source-conflict'
        elif observed.get(key) or qualified_native:
            reason = 'qualified-address-point-available'
        if reason:
            outcomes[reason] += 1
            if reason == 'qualified-point-source-conflict':
                rejected.append({'key': key, 'originalPrimaryKey': target['originalPrimaryKey'], 'targetAddress': target['address'],
                                 'reason': reason, 'sourceConflicts': vetoes.get(key, []), 'nativeConflicts': native_issues,
                                 'pointSelectionConflict': point_withholds.get(key)})
                consensus_vetoes.append({'originalPrimaryKey': target['originalPrimaryKey'], 'targetAddress': target['address'],
                                         'source': 'neris-range-point-audit', 'reasons': [reason]})
            continue
        candidate = tiger_candidates.get(key)
        if candidate is None:
            outcomes['no-qualified-native-address-range'] += 1
            continue
        if (candidate.get('targetId') != scope+':'+key or candidate.get('diagnosticInput') != target or
                candidate.get('address') != target['address'] or candidate.get('originalAddress') != target['address'] or
                candidate['match'].get('method') != 'tiger-address-range' or candidate['match'].get('point', {}).get('precision') != 'address-range' or
                candidate.get('countyFips') != candidate['match']['point'].get('countyFips') or
                target.get('sourceCounty') and target['sourceCounty'] != candidate['countyFips'] or
                not validate_tiger_diagnostic_candidate(candidate)):
            raise ValueError('Range source is not exactly bound to the frozen native physical-site target')
        proof = copy.deepcopy(target['primaryAddressEvidence']); proof.pop('diagnosticOnly')
        proof['method'] = method
        comparisons = [{'nativeId': record['object']['id'], 'objectId': record['object']['oid'], 'sourceKind': record['kind'],
                        'addressAsReported': copy.deepcopy(record['object']['address']),
                        'coordinatesAsReported': copy.deepcopy(record['coordinates']),
                        'nativePointIssue': record['withheldReason'], 'pointCountyFips': record['countyFips'],
                        'selectedNativeSite': record['object']['id'] == proof['site']['id']} for record, _ in native_matches]
        if not any(row['selectedNativeSite'] for row in comparisons):
            raise ValueError('Selected native site is absent from retained source-address observations')
        proof['rangeGeocoding'] = {'targetKey': key, 'targetsSha256': target_sha,
                                  'selectionBasis': 'native-site-address-matched-to-complete-public-address-ranges',
                                  'precision': 'address-range', 'geometryRole': 'interpolated-road-location',
                                  'nativeCoordinatesUsed': False, 'pointSourceSelection': 'no-qualified-point-and-no-qualified-source-conflict',
                                  'auditedPointSources': sorted(reports), 'qualifiedPointObservationCount': 0,
                                  'qualifiedNativeNerisPointCount': 0, 'qualifiedPointSourceConflictCount': 0,
                                  'pointSourceReportDigests': {source: metadata['reportSha256'] for source, metadata in summaries.items()},
                                  'rangeSourceReportSha256': sha(dump(tiger_report)),
                                  'selectedCoordinates': [candidate['match']['latitude'], candidate['match']['longitude']],
                                  'sourceRange': copy.deepcopy(candidate['match']),
                                  'nativeNerisObservations': sorted(comparisons, key=lambda row: row['nativeId'])}
        old = original[target['originalPrimaryKey']]
        candidates.append({'key': old['key'], 'source': old['source'], 'state': old['state'],
                           'originalAddress': copy.deepcopy(old['address']), 'originalStatus': old['status'],
                           'address': copy.deepcopy(target['address']), 'countyFips': candidate['countyFips'],
                           'match': copy.deepcopy(candidate['match']), 'primaryAddressEvidence': proof})
        outcomes['native-site-interpolated-road-location'] += 1
    return {'schemaVersion': 2, 'method': method, 'family': family, 'originalPrimaryIdentityCount': 46791,
            'targetVariantsSha256': target_sha, 'targetVariantCount': len(targets), 'requiredPointSources': sorted(reports),
            'pointSourceReportDigests': {source: metadata['reportSha256'] for source, metadata in summaries.items()},
            'rangeSourceReportSha256': sha(dump(tiger_report)), 'candidates': candidates, 'rejected': rejected,
            'consensusVetoes': consensus_vetoes, 'outcomes': dict(sorted(outcomes.items())),
            'limitations': 'Inferred department/site identity with a separately validated native address-range interpolation along a road. This is an address-range location, not a reported building point. A qualified point or qualified source conflict blocks range fallback.'}
