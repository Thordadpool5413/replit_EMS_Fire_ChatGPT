"""Join service records to a unique department in the same state and headquarters city."""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

app = Path(__file__).resolve().parents[1] / 'artifacts/ems-territory-intelligence'
registry = app / 'public/registry'
data = app / 'src/data'


def read(path):
    return json.loads(path.read_text())


def words(value):
    return ' '.join(re.findall(r'[a-z0-9]+', (value or '').lower()))


def name_key(name):
    name = words(name).replace(' dept', ' department').replace(' vol ', ' volunteer ')
    return re.sub(r'\bfire rescue services?$', 'fire rescue', name)


billing = read(data / 'fireBillingIdentityMatches.json')
states = read(registry / 'national/index.json')['byState']
reviewed = {
    (source, name.lower()): target for source, name, target in re.findall(
        r"\['([^']+)', \{ name: '([^']+)', fdid: '(FDID:[^']+)' \}\]",
        (data / 'providerProfileEvidence.ts').read_text())
}
result = {}
ems_departments = set()
for state in sorted(states):
    rows = read(registry / f'national/{state}.json')
    fire = {r[0][5:]: r for r in rows if r[1] == 'USFA' and 'location-' not in r[0]}
    names = defaultdict(set)
    known = defaultdict(set)
    aliases = {}
    for fid, r in fire.items():
        if r[4]:
            names[(words(r[4]), name_key(r[2]))].add(fid)
        if 'FDID:' + fid in billing:
            known['NPI:' + billing['FDID:' + fid]].add(fid)

    def link(key, name, city):
        target = reviewed.get((key, name.lower()), '').removeprefix('FDID:')
        choices = {target} if target in fire else known.get(key) or names.get((words(city), name_key(name)), set())
        if len(choices) == 1:
            aliases[key] = next(iter(choices)).split(':', 1)[1]

    for r in rows:
        if r[1] == 'NPPES' and not r[9]:
            link('NPI:' + r[0][6:], r[2], r[4])
    for r in read(registry / f'neris-stations/{state}.json'):
        link('NERIS:' + r['id'], r['name'], r['address'][2])
    if state in ('FL', 'OH'):
        for r in read(registry / f'state-ems/{state}.json')['records']:
            if state == 'FL' and r['headquartersState'] != state:
                continue
            kind = 'license' if state == 'FL' else 'agency-code'
            key = f"STATE-EMS:{state}:{kind}:{r['identifier']}"
            link(key, r['name'], r['city'])
            if state == 'OH' and key in aliases and r['serviceLevel'] in ('Paramedic', 'AEMT', 'EMT', 'EMR'):
                ems_departments.add(state + ':' + aliases[key])
    if state == 'TX':
        for r in read(registry / 'state-ems-review/TX-review.json')['records']:
            if r['state'] == state:
                link(r['sourceKey'], r['dbaName'] or r['name'], r['city'])
    if state == 'NY':
        for r in read(registry / 'state-ems-review/NY-westchester-review.json')['records']:
            if r['stateAsReported'] == state:
                link(r['reviewKey'], r['name'], r['cityAsReported'])
    result[state] = aliases

for filename, payload in [('providerDepartmentAliases.json', result), ('emsDepartmentCodes.json', sorted(ems_departments))]:
    path = data / filename
    content = json.dumps(payload, separators=(',', ':'), sort_keys=True) + '\n'
    if '--check' in sys.argv:
        if not path.exists() or path.read_text() != content:
            sys.exit(f'Regenerate {filename} with python scripts/build-provider-aliases.py')
    else:
        path.write_text(content)
