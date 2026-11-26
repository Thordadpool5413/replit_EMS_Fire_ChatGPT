#!/usr/bin/env python3
"""Measure the remaining original identities and prepare an unsent address batch."""
import argparse
import collections
import csv
import io
import json
import pathlib
from backfill_provider_locations import sha
from address_normalization import physical_address
from primary_recovery_baseline import load_primary_baseline
from build_primary_mapping_release import dump, metric, usable

DESTINATION = 'https://geocoding.geo.census.gov/geocoder/geographies/addressbatch'


def prepare(directory):
    candidate = directory/'candidate'
    index = json.loads((candidate/'index.json').read_bytes())
    rows = []
    for chunk in index['chunks']:
        raw = (candidate/chunk['file']).read_bytes()
        if sha(raw) != chunk['sha256']:
            raise ValueError('Residual review candidate shard changed')
        values = json.loads(raw)
        if len(values) != chunk['count']:
            raise ValueError('Residual review shard membership changed')
        rows.extend(values)
    _, originals, baseline_sha = load_primary_baseline()
    original = {entry['key']: entry for entry in originals}
    if len(rows) != 46791 or len({entry['key'] for entry in rows}) != 46791 or {entry['key'] for entry in rows} != set(original):
        raise ValueError('Residual review must preserve all original primary identities')
    result = metric(rows)
    backend = json.loads((directory/'backend-report.json').read_bytes())
    if result != backend['after'] or result != index['primaryCoverageTarget']:
        raise ValueError('Residual review differs from the measured complete candidate')
    residual = [entry for entry in rows if not usable(entry)]
    summary = {
        'schemaVersion': 1, 'baselineIndexSha256': baseline_sha,
        'originalPrimaryCount': 46791, 'usablePrimaryCount': result['usableMapped'],
        'requiredUsablePrimaryCount': 44452, 'remainingToTarget': result['remainingToTarget'],
        'unusablePrimaryCount': len(residual),
        'bySource': dict(sorted(collections.Counter(e['source'] for e in residual).items())),
        'byState': dict(sorted(collections.Counter(e['state'] for e in residual).items())),
        'byCurrentStatus': dict(sorted(collections.Counter(e['status'] for e in residual).items())),
        'originalPhysicalAddressCount': sum(physical_address(original[e['key']]['address']) for e in residual),
        'retainedCountyHolds': sum(e['status'] == 'mapped' and bool(e.get('sourceCounty')) and e['sourceCounty'] != e.get('countyFips') for e in residual),
        'requestPrepared': False,
    }
    (directory/'residual-summary.json').write_bytes(dump(summary))
    if result['targetMet']:
        return summary
    groups = {}
    exclusions = collections.Counter()
    for entry in sorted(residual, key=lambda e: e['key']):
        old = original[entry['key']]
        if any(entry[field] != old[field] for field in ('key', 'name', 'source', 'state', 'sourceDate', 'sourceCounty')):
            raise ValueError('Residual request changed original source identity fields')
        if old['status'] in ('historical', 'review'):
            exclusions['inactive-or-original-review'] += 1
            continue
        if entry['status'] == 'mapped' and entry.get('sourceCounty') and entry['sourceCounty'] != entry.get('countyFips'):
            exclusions['retained-county-conflict'] += 1
            continue
        address = old['address']
        if not physical_address(address):
            exclusions['no-original-physical-street-address'] += 1
            continue
        # Only case/edge whitespace are ignored for duplicate transport rows.
        # Every emitted value is copied from an original public source record.
        signature = tuple(address[field].strip().upper() for field in ('street', 'city', 'state', 'zip'))
        group = groups.setdefault(signature, {'address': address, 'primaryRecords': []})
        group['primaryRecords'].append({
            'key': old['key'], 'source': old['source'], 'sourceDate': old['sourceDate'],
            'sourceCounty': old['sourceCounty'], 'originalAddress': old['address'],
            'originalStatus': old['status'], 'currentStatus': entry['status'],
        })
    output = io.StringIO(newline='')
    writer = csv.writer(output, lineterminator='\r\n')
    bindings = []
    for ordinal, signature in enumerate(sorted(groups), 1):
        group = groups[signature]
        address = group['address']
        request_id = str(ordinal)
        writer.writerow([request_id]+[address[field] for field in ('street', 'city', 'state', 'zip')])
        bindings.append({'requestId': request_id, 'address': address, 'primaryRecords': group['primaryRecords']})
    payload = output.getvalue().encode('utf-8')
    name = 'census-address-request.csv'
    (directory/name).write_bytes(payload)
    manifest = {
        'schemaVersion': 1, 'status': 'prepared-not-sent', 'authorizationRequired': True,
        'destination': DESTINATION, 'payloadFile': name,
        'columns': ['request_id', 'street', 'city', 'state', 'zip'],
        'containsHeader': False, 'encoding': 'utf-8', 'lineEnding': 'CRLF',
        'uniqueAddressRequests': len(bindings),
        'originalPrimaryRecordsRepresented': sum(len(row['primaryRecords']) for row in bindings),
        'bytes': len(payload), 'sha256': sha(payload),
        'baselineIndexSha256': baseline_sha,
        'donorCandidateIndexSha256': sha((candidate/'index.json').read_bytes()),
        'backendReportSha256': sha((directory/'backend-report.json').read_bytes()),
        'excludedOriginalRecords': dict(sorted(exclusions.items())),
        'transportFieldsPolicy': 'public original street/city/state/ZIP plus a numeric request ID; no agency name, NPI, FDID, phone, patient data, or inferred address',
        'resultPolicy': 'Address responses are candidates only. Original identity, source county, retained source conflicts, coordinate consensus and actual frontend gates still apply.',
        'approvalReason': 'Automatic approval review previously rejected bulk address submission without explicit authorization of this payload and destination.',
    }
    (directory/'census-address-request-bindings.json').write_bytes(dump(bindings))
    (directory/'census-address-request-manifest.json').write_bytes(dump(manifest))
    summary.update(requestPrepared=True, uniqueOriginalAddressRequests=len(bindings),
                   originalPrimaryRecordsRepresented=manifest['originalPrimaryRecordsRepresented'],
                   requestSha256=manifest['sha256'], requestBytes=len(payload))
    (directory/'residual-summary.json').write_bytes(dump(summary))
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.input)), flush=True)


if __name__ == '__main__':
    main()
