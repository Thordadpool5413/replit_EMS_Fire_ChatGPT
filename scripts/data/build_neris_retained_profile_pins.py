#!/usr/bin/env python3
"""Build finite frontend bindings only from completely replayed retained proofs."""
import argparse
import importlib
import json
import pathlib
import subprocess
from backfill_provider_locations import ROOT
from recover_neris_primary import dump

FRONTEND = ROOT/'artifacts/ems-territory-intelligence/src/services'
API = ROOT/'artifacts/api-server/src/lib'
PROFILES = {
 'mailing': ('retain_neris_mailing_sites', None, 'nerisMailingSitePins.json', 'neris-department-mailing-site-correlation'),
 'mailing-geocoded': ('retain_neris_mailing_geocoded_sites', None, 'nerisMailingGeocodedSitePins.json', 'neris-department-mailing-geocoded-site-correlation'),
 'range': ('retain_neris_range_sites', 'core', 'nerisRangeSitePins.json', 'neris-department-range-site-correlation'),
 'mailing-range': ('retain_neris_range_sites', 'mailing', 'nerisMailingRangeSitePins.json', 'neris-department-mailing-range-site-correlation'),
 'website': ('retain_neris_website_sites', None, 'nerisWebsiteSitePins.json', 'neris-department-website-site-correlation'),
 'grid': ('retain_neris_grid_points', None, 'nerisGridPointPins.json', 'wi-mi-directional-grid-house-number'),
}


def build(profile):
    module_name, family, filename, method = PROFILES[profile]
    module = importlib.import_module(module_name)
    candidates, originals, national = module.candidate_index(*([family] if family else []))
    directory = module.evidence_directory(family) if family else module.EVIDENCE
    manifest = json.loads((directory/'manifest.json').read_bytes())
    records = []; examples = []; example_groups = set()
    for key, candidate in sorted(candidates.items()):
        original = originals[key]; row = national.get(key)
        if row is None: raise ValueError('Finite binding lacks an independently retained native registry row')
        if profile == 'grid':
            payload = {'match': candidate['match'], 'address': candidate['address']}
            group = (original['state'], candidate['match']['point']['addressComponent']['sourceField'])
        else:
            proof = candidate['primaryAddressEvidence']
            if proof['method'] != method or proof['originalAddress'] != original['address']:
                raise ValueError('Finite profile candidate changed its original address or association method')
            payload = {field: original.get(field, '') for field in ('key', 'name', 'state', 'source', 'sourceCounty')}
            payload.update(countyFips=candidate['countyFips'], address=candidate['address'], match=candidate['match'],
                           originalAddress=original['address'], primaryAddressEvidence=proof)
            group = (proof['siteRole'], proof['site']['sourceKind'], proof.get('correlation', {}).get('nameBasis'))
        records.append({'key': key, 'payload': payload, 'nationalRow': row})
        if len(examples)<4 and group not in example_groups:
            examples.append({'candidate': candidate, 'original': original, 'nationalRow': row}); example_groups.add(group)
    data = {'profile': profile, 'method': method, 'sourceArchiveSha256': manifest['archiveSha256'], 'records': records}
    result = subprocess.run(['node', str(ROOT/'scripts/data/build_neris_profile_pins.mjs')], input=dump(data), capture_output=True, check=True)
    pins = json.loads(result.stdout)
    if pins['candidateCount'] != len(candidates) or pins['sourceArchiveSha256'] != manifest['archiveSha256']:
        raise ValueError('Finite frontend binding generation failed')
    (FRONTEND/filename).write_bytes(result.stdout)
    fixture = ROOT/'scripts/fixtures'/('neris-retained-'+profile+'-examples.json')
    fixture.write_bytes(dump(examples))
    if profile == 'grid':
        for name in ('nerisProofHash.ts', 'nerisGridAddressContract.ts', 'nerisGridPointPins.json'):
            (API/name).write_bytes((FRONTEND/name).read_bytes())
    return data


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--profile', choices=tuple(PROFILES), action='append', required=True)
    parser.add_argument('--validation-output', type=pathlib.Path); args = parser.parse_args()
    all_data = [build(profile) for profile in args.profile]
    if args.validation_output:
        args.validation_output.parent.mkdir(parents=True, exist_ok=True); args.validation_output.write_bytes(dump(all_data))
    print(json.dumps({data['profile']: {'retainedCandidates': len(data['records']), 'sourceArchiveSha256': data['sourceArchiveSha256']} for data in all_data}), flush=True)

if __name__ == '__main__':
    main()
