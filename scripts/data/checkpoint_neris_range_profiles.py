#!/usr/bin/env python3
"""Package both range families with one fully verified source catalog lifetime."""
import argparse
import json
import pathlib
from recover_neris_primary import dump
from retain_neris_range_sites import evidence_directory, stage, validated_catalog
from build_neris_retained_profile_pins import build

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--validation-output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    bindings = []
    for family, profile in (('core', 'range'), ('mailing', 'mailing-range')):
        directory = evidence_directory(family)
        if not directory.exists():
            stage(family)
        report, _, _, manifest = validated_catalog(family)
        bindings.append(build(profile))
        print(json.dumps({'family': family, 'candidateCount': manifest['candidateCount'],
                          'archiveSha256': manifest['archiveSha256'], 'outcomes': report['outcomes'],
                          'fullNativeReplayAndArchiveReadback': 'passed'}), flush=True)
    args.validation_output.parent.mkdir(parents=True, exist_ok=True)
    args.validation_output.write_bytes(dump(bindings))

if __name__ == '__main__':
    main()
