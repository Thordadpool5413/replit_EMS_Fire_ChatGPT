#!/usr/bin/env python3
"""Five complete independent point-source audits for frozen native mailing sites."""
import argparse
import copy
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha
from recover_neris_primary import dump, load_departments
from recover_neris_mailing_sites import GEOCODED_METHOD as METHOD
from retain_neris_mailing_sites import validated_catalog, target_edition
from recover_neris_geocoded_sites import generate as generate_sites

REQUIRED_SOURCES = {'usgs', 'hifld-ems', 'hifld-fire', 'nad', 'overture'}
NAD_EVIDENCE = ROOT/'scripts/data/evidence/primary-nad-extended/2026-11-26'
QUALIFIED_PLACES_REASONS = {'source-point-county-conflict', 'coordinate-shared-by-distinct-addresses',
                            'conflicting-native-points', 'nonactive-lifecycle'}


def load_targets(path=None):
    report, targets, inputs, _ = validated_catalog()
    edition = target_edition()
    if sha(dump(targets)) != edition['targetSha256'] or len(targets) != edition['targetCount']:
        raise ValueError('Frozen mailing target scope changed')
    if path is not None and path.read_bytes() != dump(targets):
        raise ValueError('Supplied mailing targets differ from retained reciprocal identity scope')
    return targets, inputs, edition


def overture_report(targets, target_sha):
    from retain_overture_primary_variants import overture_diagnostic_catalog, validate_overture_diagnostic_candidate
    catalog = overture_diagnostic_catalog('overture-place-address')
    target_map = {target['key']: target for target in targets}
    if any(catalog['targets'].get(key) != target for key, target in target_map.items()):
        raise ValueError('Complete Places catalog does not bind every frozen native mailing target')
    candidates = []
    for key, candidate in sorted(catalog['candidates'].items()):
        if key not in target_map:
            continue
        if not validate_overture_diagnostic_candidate(candidate, target_map[key]):
            raise ValueError('Places candidate changed its retained native address/target evidence')
        candidates.append(copy.deepcopy(candidate))
    rejections, raw_rejections = [], []
    for row in catalog['rejected']:
        key = row['key']
        if key not in target_map:
            continue
        if row.get('targetAddress') != target_map[key]['address'] or row.get('originalPrimaryKey') != target_map[key]['originalPrimaryKey']:
            raise ValueError('Places rejection is not bound to the frozen physical-site address')
        reasons = set(row.get('blockedReasons', [])) | set(row.get('reasons', []))
        if isinstance(row.get('reason'), str):
            reasons.add(row['reason'])
        consequential = sorted(reasons & QUALIFIED_PLACES_REASONS)
        raw_rejections.append(copy.deepcopy(row))
        if consequential:
            rejections.append({'key': key, 'reasons': consequential, 'nativeRejection': copy.deepcopy(row)})
    uncertain = [copy.deepcopy(row) for row in catalog.get('uncertain', []) if row['key'] in target_map]
    return {'source': 'overture-place-neris-diagnostic', 'targetsSha256': target_sha,
            'completeScopeTargetCount': len(targets), 'completeNativeSourceReplay': True,
            'nativeVariantReportSha256': catalog['reportSha256'], 'candidates': candidates,
            'rejected': rejections, 'nativeRejections': raw_rejections, 'uncertain': uncertain}


def generate(targets, inputs, reports):
    edition = target_edition()
    if sha(dump(targets)) != edition['targetSha256'] or len(targets) != edition['targetCount']:
        raise ValueError('Mailing targets changed after source-scope freeze')
    result = generate_sites(targets, inputs, reports, load_departments(), targets_sha=edition['targetSha256'],
                            method=METHOD, nad_diagnostic_count=len(targets)+609, required_sources=REQUIRED_SOURCES)
    result['mailingSourceSha256'] = edition['mailingSourceSha256']
    result['placesUncertainty'] = copy.deepcopy(reports.get('overture', {}).get('uncertain', []))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', type=pathlib.Path)
    for source in sorted(REQUIRED_SOURCES - {'overture'}):
        parser.add_argument('--'+source+'-report', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    targets, inputs, edition = load_targets(args.targets)
    reports = {source: json.loads(getattr(args, source.replace('-', '_')+'_report').read_bytes())
               for source in REQUIRED_SOURCES - {'overture'}}
    reports['overture'] = overture_report(targets, edition['targetSha256'])
    result = generate(targets, inputs, reports)
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_bytes(dump(result))
    print(json.dumps({'candidateCount': len(result['candidates']), 'withheldCount': len(result['withheld']),
                      'completeRequiredSources': result['completeRequiredSources'], 'outcomes': result['outcomes']}), flush=True)


if __name__ == '__main__':
    main()
