#!/usr/bin/env python3
"""Local immutable-source replay and aggregate comparison of the NAD correction."""
import collections
import copy
import json
import pathlib
import zipfile

from backfill_provider_locations import ROOT, sha, digest_file
from recover_nppes_native_primary import dump
from recover_nppes_primary_components_extended import retain, dependencies, EVIDENCE


def main():
    old_path = ROOT/'scripts/data/evidence/primary-nppes-components-extended/2026-11-26'
    old_manifest = json.loads((old_path/'manifest.json').read_bytes())
    old_archive_sha = digest_file(old_path/'original.zip')
    with zipfile.ZipFile(old_path/'original.zip') as archive:
        old_raw = archive.read('report.json')
        old = json.loads(old_raw)
    assert sha(old_raw) == old_manifest['reportSha256']
    before_dependencies = dependencies()
    assert before_dependencies == old_manifest['sourceDependencies']
    new, manifest = retain()
    assert dependencies() == before_dependencies
    assert digest_file(old_path/'original.zip') == old_archive_sha
    assert new['sourceReportDigests'] == old['sourceReportDigests']
    assert new['nativeTargetsSha256'] == old['nativeTargetsSha256']
    old_candidates = {row['key']: row for row in old['candidates']}
    new_candidates = {row['key']: row for row in new['candidates']}
    assert len(old_candidates) == 273
    assert all(new_candidates.get(key) == row for key, row in old_candidates.items())
    assert dump([row for row in new['candidates'] if row['key'] in old_candidates]) == dump(old['candidates'])
    old_decisions = {row['key']: row for row in old['selectionDecisions']}
    new_decisions = {row['key']: row for row in new['selectionDecisions']}
    affected = []
    for key, decision in old_decisions.items():
        rows = [row for row in decision['pointConflicts']
                if row['source'] == 'nad' and set(row['reasons']) == {'unsupported-source-point'}]
        if rows:
            affected.append({'key': key, 'oldDecision': decision, 'newDecision': new_decisions[key],
                             'newCandidate': new_candidates.get(key), 'oldCandidate': old_candidates.get(key)})
        else:
            assert new_decisions[key]['outcome'] == decision['outcome']
    assert len(affected) == 10
    private = {'oldManifest': old_manifest, 'newManifest': manifest,
               'sourceDependencies': before_dependencies, 'cases': affected,
               'newCandidates': [row for row in new['candidates'] if row['key'] not in old_candidates]}
    directory = ROOT/'generated-artifacts'
    directory.mkdir(exist_ok=True)
    private_path = directory/'cms-qualification-review-private.json'
    private_path.write_bytes(dump(private))
    aggregate = {
        'schemaVersion': 1, 'scope': 'local-derived-profile-qualification-review',
        'originalPrimaryCount': 46791, 'nativeTargetCount': 609,
        'nativeTargetScopeUnchanged': True, 'allSourceReportDigestsUnchanged': True,
        'allSourceDependenciesUnchanged': True, 'oldDerivedArchiveUnchanged': True,
        'oldCandidateCount': len(old_candidates), 'oldCandidatesByteIdentical': True,
        'oldCandidateBytesSha256': sha(dump(old['candidates'])),
        'newCandidateCount': len(new_candidates),
        'newIndependentPointCandidateCount': len(set(new_candidates)-set(old_candidates)),
        'oldQualifiedConflictCount': old['outcomes']['qualified-native-source-conflict'],
        'affectedUnsupportedOnlyNadTargets': len(affected),
        'retainedNonselectableNadEndpoints': sum(len(row['newDecision']['qualifiedNadObservations']) for row in affected),
        'affectedOutcomes': dict(sorted(collections.Counter(row['newDecision']['outcome'] for row in affected).items())),
        'oldOutcomes': old['outcomes'], 'newOutcomes': new['outcomes'],
        'oldReportSha256': sha(old_raw), 'oldArchiveSha256': old_archive_sha,
        'newReportSha256': manifest['reportSha256'], 'newArchiveSha256': manifest['archiveSha256'],
        'privateComparisonSha256': digest_file(private_path),
        'newSourceQualificationCodeSha256': digest_file(ROOT/'scripts/data/recover_nppes_primary_components_extended.py'),
        'sharedConsensusCodeSha256': digest_file(ROOT/'scripts/data/primary_source_consensus.py'),
        'releaseGainsMeasured': False, 'recordLevelExported': False,
    }
    (directory/'cms-qualification-review-aggregate.json').write_bytes(dump(aggregate))
    print(json.dumps(aggregate, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
