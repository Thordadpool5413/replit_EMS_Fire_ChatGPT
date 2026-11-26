#!/usr/bin/env python3
"""Build and verify a separate release against the fixed original denominator."""
import argparse
import collections
import copy
import json
import math
import pathlib
from backfill_provider_locations import ROOT, PUBLIC, sha, read_registry, native_key, publish, verify
from primary_mapping_contract import validate_primary_entry
from primary_recovery_baseline import INDEX_SHA as BASELINE_INDEX_SHA, BASELINE, retain_baseline
from primary_source_consensus import entry_witnesses, native_neris_vetoes, INTERPOLATED
from address_normalization import normalize_street, normalized_city, source_street_line

REQUIRED = 44452
PHONE_METHOD = 'nppes-usfa-primary-site-correlation'
QUALIFIED_REJECTIONS = {
    'independent-source-rows-disagree', 'conflicting-native-points',
    'native-address-coordinate-disagreement',
    'independent-coordinate-disagreement', 'qualified-source-coordinate-disagreement',
    'primary-source-county-disagreement', 'original-source-county-disagreement',
    'native-source-county-disagreement', 'source-county-disagreement',
    'source-point-county-conflict', 'source-coordinate-shared-across-distinct-addresses',
    'coordinate-reused-across-distinct-addresses', 'coordinate-shared-by-distinct-addresses',
    'nonactive-lifecycle', 'retired-native-address', 'valid-independent-source-conflict',
    'range-coordinate-disagreement', 'conflicting-native-ranges',
}


def dump(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(',', ':'), allow_nan=False)+'\n').encode()


def baseline():
    return retain_baseline()


def usable(entry):
    return (entry['status'] == 'mapped' and bool(entry.get('match')) and
            (not entry.get('sourceCounty') or entry['sourceCounty'] == entry['countyFips']))


def metric(entries):
    count = sum(bool(usable(entry)) for entry in entries)
    return {
        'totalPrimarySourceRecords': len(entries),
        'rawMapped': sum(entry['status'] == 'mapped' for entry in entries),
        'usableMapped': count, 'usableCoveragePct': round(100*count/46791, 4),
        'targetPct': 95, 'requiredMapped': REQUIRED,
        'remainingToTarget': max(0, REQUIRED-count), 'targetMet': count >= REQUIRED,
        'countyConflictsWithheld': sum(entry['status'] == 'mapped' and bool(entry.get('sourceCounty')) and
                                       entry['sourceCounty'] != entry['countyFips'] for entry in entries),
        'bySource': {source: sum(bool(usable(entry)) for entry in entries if entry['source'] == source)
                     for source in ('USFA', 'NPPES', 'State EMS')},
        'byMethod': dict(sorted(collections.Counter(entry['match']['method'] for entry in entries if usable(entry)).items())),
    }


def apply_candidate(original, candidate):
    if candidate.get('key') != original['key'] or candidate.get('originalAddress') != original['address']:
        raise ValueError('Candidate changed the original native identity/address binding')
    for key in ('name', 'source', 'state', 'sourceDate', 'sourceCounty'):
        if key in candidate and candidate[key] != original[key]:
            raise ValueError('Candidate changes immutable source metadata: '+key)
    result = copy.deepcopy(original)
    result.update(status='mapped', address=copy.deepcopy(candidate['address']),
                  match=copy.deepcopy(candidate['match']), countyFips=candidate['countyFips'])
    if candidate.get('primaryAddressEvidence'):
        result['primaryAddressEvidence'] = copy.deepcopy(candidate['primaryAddressEvidence'])
    elif result['address'] != original['address']:
        raise ValueError('Changed primary address lacks an explicit source association')
    return result


def distance(left, right):
    y1, x1 = map(math.radians, (left['latitude'], left['longitude']))
    y2, x2 = map(math.radians, (right['latitude'], right['longitude']))
    h = math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12742000*math.asin(min(1, math.sqrt(h)))


def rank(entry):
    match = entry['match']
    point = match.get('point', {})
    base = {'nad-address-point': 0, 'usgs-structure-address': 1, 'overture-address': 2,
            'neris-reported-address': 3, 'hifld-ems-address': 4, 'hifld-fire-address': 5,
            'overture-place-address': 6, 'ny-sam-address-point': 0,
            'ohio-lbrs-address-point': 0, 'regional-address-point': 0,
            'tiger-address-range': 20, 'census-address-range': 21}
    if match['method'] not in base:
        raise ValueError('Unknown primary coordinate method')
    return (base[match['method']], point.get('placement') in ('Unknown', 'Other'),
            point.get('precision') == 'blockface', str(point.get('objectId', point.get('nativeId', ''))),
            (entry.get('primaryAddressEvidence') or {}).get('method', ''))


def same_site_address(left, right):
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    if left.get('state') != right.get('state') or normalize_street(source_street_line(left.get('street', ''))) != normalize_street(source_street_line(right.get('street', ''))):
        return False
    if left.get('zip') and right.get('zip'):
        return left['zip'] == right['zip']
    return normalized_city(left.get('city', '')) == normalized_city(right.get('city', ''))


def inferred_site_identity(entry):
    proof = entry.get('primaryAddressEvidence') or {}
    if proof.get('method') == PHONE_METHOD:
        return ('USFA', proof.get('donor', {}).get('entry', {}).get('key'), proof.get('siteRole'))
    return (proof.get('department', {}).get('id'), proof.get('site', {}).get('id'), proof.get('siteRole'))


def _reason_set(row):
    result = set(row.get('reasons') or []) | set(row.get('blockedReasons') or [])
    if isinstance(row.get('reason'), str):
        result.add(row['reason'])
    return result & QUALIFIED_REJECTIONS


def collect_vetoes(originals, reports, target_batches=()):
    """Bind consequential negative evidence to the exact queried physical site."""
    by_key = collections.defaultdict(list)
    by_digest = {}
    for batch in target_batches:
        rows = batch['targets']
        by_digest[batch['sha256']] = {row['key']: row for row in rows}
        for row in rows:
            by_key[row['key']].append(row)
    vetoes = collections.defaultdict(list)
    for report in reports:
        source = report.get('source') or report.get('method') or 'neris'
        digest = next((report.get(name) for name in (
            'baselineIndexSha256', 'targetsSha256', 'targetVariantsSha256', 'targetVariantSha256',
            'targetFileSha256') if report.get(name) in by_digest), None)
        report_targets = by_digest.get(digest, {})
        for field in ('rejected', 'withheld', 'originalAddressCoordinateConflicts', 'consensusVetoes'):
            for row in report.get(field, []):
                reasons = _reason_set(row)
                nested = row.get('sourceConflicts') or []
                for item in nested:
                    reasons |= _reason_set(item)
                if not reasons:
                    continue
                key = row.get('originalPrimaryKey') or row.get('primaryKey') or row.get('key', '').split('@', 1)[0]
                if key not in originals:
                    raise ValueError('Qualified rejection is not bound to an original primary identity')
                address = row.get('targetAddress') or row.get('originalAddress') or row.get('address')
                target = report_targets.get(row.get('key'))
                if not address and target:
                    address = target.get('address')
                if not address and row.get('key') in by_key:
                    addresses = {dump(target['address']): target['address'] for target in by_key[row['key']]}
                    if len(addresses) == 1:
                        address = next(iter(addresses.values()))
                if not address and row.get('key') == key and (
                        report.get('baselineIndexSha256') in (None, BASELINE_INDEX_SHA) and not report.get('method')):
                    address = originals[key]['address']
                if not isinstance(address, dict):
                    raise ValueError('Qualified source rejection lacks an explicit target-address binding: '+str(row.get('key')))
                row_source = row.get('source') or source
                precision = 'range' if row_source in ('tiger', 'tiger-address-range', 'tiger-addrfeat-2026') or report.get('method') == 'tiger-address-range' else 'point'
                vetoes[key].append({'source': row_source, 'targetAddress': copy.deepcopy(address),
                                    'reasons': sorted(reasons), 'precision': precision})
    return vetoes


def _phone_parent_valid(entry, final_entries):
    proof = entry.get('primaryAddressEvidence') or {}
    if proof.get('method') != PHONE_METHOD:
        return True
    donor = proof.get('donor', {}).get('entry')
    if not isinstance(donor, dict):
        return False
    final = final_entries.get(donor.get('key'))
    return bool(final and final.get('source') == 'USFA' and usable(final) and donor == final)


def combine(originals, neris, source_reports, national, target_batches=()):
    original = {entry['key']: entry for entry in originals}
    if len(original) != len(originals):
        raise ValueError('Original primary identity is duplicated')
    result = copy.deepcopy(original)
    candidates = collections.defaultdict(list)
    audit, withheld_legacy = [], set()
    if not neris and any((entry.get('match') or {}).get('method') == 'neris-reported-address' for entry in originals):
        raise ValueError('Complete legacy NERIS audit is required for this release')
    if neris:
        from recover_neris_primary import validate_candidate
        expected = {entry['key'] for entry in originals if (entry.get('match') or {}).get('method') == 'neris-reported-address'}
        if {row['key'] for row in neris['legacyAudit']} != expected or len(neris['legacyAudit']) != len(expected):
            raise ValueError('Legacy NERIS audit is incomplete')
        for row in neris['legacyAudit']:
            key, old = row['key'], original[row['key']]
            if row['accepted']:
                candidate = row['candidate']
                if not validate_candidate(candidate, old, national.get(key)):
                    raise ValueError('Legacy NERIS proof did not replay')
                changed = apply_candidate(old, candidate)
                if (changed['match']['latitude'], changed['match']['longitude']) != (old['match']['latitude'], old['match']['longitude']):
                    raise ValueError('Legacy audit moved a previously supported coordinate')
                result[key] = changed
            else:
                withheld_legacy.add(key)
                result[key].update(status='review', match=None, countyFips='')
            audit.append({'key': key, 'accepted': row['accepted'], 'reason': row['reason']})
        source_reports = [neris, *source_reports]
    vetoes = collect_vetoes(original, source_reports, target_batches)
    for report in source_reports:
        if report.get('_vetoOnly'):
            continue
        for candidate in report['candidates']:
            key = candidate['key']
            if key not in original:
                raise ValueError('New or synthetic identities cannot enter the primary release')
            old = original[key]
            if old['status'] == 'mapped' and key not in withheld_legacy:
                continue
            if old['status'] in ('historical', 'review'):
                raise ValueError('Inactive or conflicted identity cannot be promoted')
            proposed = apply_candidate(old, candidate)
            if not validate_primary_entry(proposed, national.get(key)):
                raise ValueError('Candidate failed native source replay: '+key+' '+proposed['match']['method'])
            candidates[key].append(proposed)
    conflicts, selected, stale_donors = [], [], []
    # All USFA parents reach their final decision before any NPPES phone child.
    ordered_keys = sorted(candidates, key=lambda key: (original[key]['source'] == 'NPPES', key))
    for key in ordered_keys:
        all_options = []
        for entry in candidates[key]:
            if _phone_parent_valid(entry, result):
                all_options.append(entry)
            else:
                stale_donors.append({'key': key, 'reason': 'phone-donor-differs-from-final-usable-usfa-entry'})
        if not all_options:
            continue
        direct = [entry for entry in all_options if (entry.get('primaryAddressEvidence') or {}).get('association') != 'inferred']
        preferred = direct or all_options
        first_address = preferred[0]['address']
        if any(not same_site_address(first_address, entry['address']) for entry in preferred):
            conflicts.append({'key': key, 'reason': 'primary-physical-site-address-disagreement'})
            continue
        if not direct and len({inferred_site_identity(entry) for entry in preferred}) != 1:
            conflicts.append({'key': key, 'reason': 'inferred-site-identity-or-address-disagreement'})
            continue
        # Other explicitly associated points at this same physical address are
        # evidence too, even when a source-native address is preferred for display.
        site_options = [entry for entry in all_options if same_site_address(first_address, entry['address'])]
        precise = [entry for entry in site_options if entry['match']['method'] not in INTERPOLATED]
        options = precise or site_options
        relevant = [row for row in vetoes.get(key, [])
                    if same_site_address(first_address, row['targetAddress']) and (not precise or row['precision'] != 'range')]
        native_reasons = native_neris_vetoes(first_address, original[key].get('sourceCounty', ''))
        if native_reasons:
            relevant.append({'source': 'neris', 'targetAddress': first_address,
                             'reasons': native_reasons, 'precision': 'point'})
        if relevant:
            conflicts.append({'key': key, 'reason': 'qualified-source-negative-evidence',
                              'targetAddress': first_address, 'sourceRejections': relevant})
            continue
        witnesses = []
        for entry in options:
            witnesses.extend(entry_witnesses(entry))
        witnesses = list({dump(point): point for point in witnesses}.values())
        counties = {point['countyFips'] for point in witnesses} | {entry['countyFips'] for entry in options}
        if len(counties) != 1 or any(distance(left, right) > 75
                                     for i, left in enumerate(witnesses) for right in witnesses[i+1:]):
            conflicts.append({'key': key, 'reason': 'qualified-source-coordinate-disagreement',
                              'methods': sorted({entry['match']['method'] for entry in options}), 'points': witnesses})
            continue
        display = [entry for entry in options if entry in preferred] or options
        chosen = sorted(display, key=rank)[0]
        result[key] = chosen
        selected.append({'key': key, 'method': chosen['match']['method'],
                         'association': (chosen.get('primaryAddressEvidence') or {}).get('method'),
                         'nativeWitnessCount': len(witnesses),
                         'corroboratingSourceMethods': sorted({point['method'] for point in witnesses})})
    rows = [result[entry['key']] for entry in originals]
    if {entry['key'] for entry in rows} != set(original):
        raise ValueError('Primary identity membership changed')
    for entry in rows:
        old = original[entry['key']]
        if any(entry[key] != old[key] for key in ('key', 'name', 'state', 'source', 'sourceDate', 'sourceCounty')):
            raise ValueError('Immutable primary metadata changed')
        if old['status'] == 'mapped' and entry['key'] not in withheld_legacy and (old.get('match') or {}).get('method') != 'neris-reported-address' and entry != old:
            raise ValueError('Existing mapped primary record changed')
    return rows, {'selected': selected, 'qualifiedSourceConflicts': conflicts,
                  'legacyNerisAudit': audit, 'stalePhoneDonorsWithheld': stale_donors}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--report', type=pathlib.Path, required=True)
    parser.add_argument('--neris-report', type=pathlib.Path)
    parser.add_argument('--source-report', action='append', type=pathlib.Path, default=[])
    parser.add_argument('--veto-report', action='append', type=pathlib.Path, default=[])
    parser.add_argument('--target-file', action='append', type=pathlib.Path, default=[])
    parser.add_argument('--require-target', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == (PUBLIC/'locations').resolve() or output.exists() and any(output.iterdir()):
        raise ValueError('Build into a new separate candidate directory')
    index, entries = baseline()
    manifest, registry_rows = read_registry()
    national = {native_key(row): row for row in registry_rows if native_key(row)}
    neris = json.loads(args.neris_report.read_bytes()) if args.neris_report else None
    reports = [json.loads(path.read_bytes()) for path in args.source_report]
    reports += [{**json.loads(path.read_bytes()), '_vetoOnly': True} for path in args.veto_report]
    target_batches = []
    for path in args.target_file:
        raw = path.read_bytes()
        targets = json.loads(raw)
        if isinstance(targets, dict):
            targets = targets['targets']
        if not isinstance(targets, list):
            raise ValueError('Target file must contain its exact explicit source-bound target list')
        target_batches.append({'sha256': sha(raw), 'targets': targets})
    updated, details = combine(entries, neris, reports, national, target_batches)
    before, after = metric(entries), metric(updated)
    sources = [{'file': path.name, 'sha256': sha(path.read_bytes()), 'vetoOnly': path in args.veto_report}
               for path in ([args.neris_report] if args.neris_report else [])+args.source_report+args.veto_report]
    report = {'schemaVersion': 2, 'baselineIndexSha256': BASELINE_INDEX_SHA,
              'before': before, 'after': after, 'sourceReports': sources, **details}
    metadata = {key: value for key, value in index.items() if key not in
                ('schemaVersion', 'generatedAt', 'benchmark', 'vintage', 'sourceScope', 'chunks',
                 'coverage', 'primaryCoverageTarget', 'primaryMappingRecovery')}
    metadata.update(primaryCoverageTarget=after, primaryMappingRecovery={
        'baselineIndexSha256': BASELINE_INDEX_SHA, 'sourceReports': sources,
        'newSourceMappings': len(details['selected']),
        'qualifiedSourceConflictsWithheld': len(details['qualifiedSourceConflicts']),
        'legacyNerisWithheld': sum(not row['accepted'] for row in details['legacyNerisAudit']),
        'stalePhoneDonorsWithheld': len(details['stalePhoneDonorsWithheld'])})
    publish(output, manifest, updated, metadata)
    verify(output, manifest, registry_rows, json.loads((PUBLIC/'state-ems/FL.json').read_bytes()))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_bytes(dump(report))
    print('Primary release coverage:', json.dumps(after), flush=True)
    if args.require_target and not after['targetMet']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
