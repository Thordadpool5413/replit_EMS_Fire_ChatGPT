"""Resolve additional operating identities with a common service name and corroborating geography."""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

app = Path(__file__).resolve().parents[1] / 'artifacts/ems-territory-intelligence'
registry = app / 'public/registry'
data = app / 'src/data'
read = lambda path: json.loads(path.read_text())
existing = read(data/'providerDepartmentAliases.json')
token = lambda value: ' '.join(re.findall(r'[a-z0-9]+', (value or '').lower()))
street_words = {'north':'n','south':'s','east':'e','west':'w','road':'rd','avenue':'ave','street':'st','boulevard':'blvd','drive':'dr','lane':'ln','highway':'hwy','fourth':'4th'}

def street(value):
    words = token(value).split()
    return ''.join(street_words.get(w,w) for w in words) if words and words[0][0].isdigit() else ''

def name(value):
    # Slash after a civic parent introduces its operating service. Fire/Rescue is one phrase.
    value = re.sub(r'^(?:city|town|village) of [^/]+/', '', value or '', flags=re.I)
    text = re.sub(r'^(?:city|town|village) of | (?:city|town|village) of$', '', token(value))
    text = re.sub(r' (?:incorporated|inc|llc|corp)$', '', text)
    return re.sub(r'\b(?:dept|vfd)\b',lambda m: 'department' if m[0]=='dept' else 'volunteer fire department',text)

def fire_root(value):
    return re.sub(r' (?:volunteer )?fire(?: (?:and )?(?:department|rescue|emergency services))+$','',name(value))

result = {}
for state, aliases in sorted(existing.items()):
    national = read(registry/'national'/f'{state}.json')
    rows = [(r[0].replace('usfa:','FDID:').replace('nppes:','NPI:'),r[2],r[4],r[5],r[10]) for r in national if not r[9] and ':location-' not in r[0].lower()]
    locations={r['key']:r for r in read(registry/'locations'/f'{state}.json')}
    for i,(key,label,city,postal,addr) in enumerate(rows):
        loc=locations.get(key)
        if not addr and loc and loc.get('status')=='mapped' and loc.get('address'):
            point=loc['address']
            if token(city)==token(point['city']) and postal[:5]==point['zip'][:5]:
                rows[i]=(key,label,city,postal,point['street'])
    for r in read(registry/'neris-stations'/f'{state}.json'):
        rows.append(('NERIS:'+r['id'],r['name'],r['address'][2],r['address'][4],r['address'][0]))
    if state in ('FL','OH'):
        for r in read(registry/'state-ems'/f'{state}.json')['records']:
            if state=='FL' and r['headquartersState']!=state: continue
            rows.append((f"STATE-EMS:{state}:"+('license:' if state=='FL' else 'agency-code:')+r['identifier'],r['name'],r['city'],r.get('postalCode'),r.get('address')))
    if state=='TX':
        for r in read(registry/'state-ems-review/TX-review.json')['records']:
            if r['state']==state: rows.append((r['sourceKey'],r['dbaName'] or r['name'],r['city'],r['zip'],r['addressAsReported']))
    if state=='NY':
        for r in read(registry/'state-ems-review/NY-westchester-review.json')['records']:
            if r['stateAsReported']==state: rows.append((r['reviewKey'],r['name'],r['cityAsReported'],r['postalCodeAsReported'],r['headquartersStreetAsReported']))
    by_name, by_zip, by_site = defaultdict(set), defaultdict(set), defaultdict(set)
    def signatures(row):
        key, label, city, postal, addr = row
        town, zip5, road = token(city), (postal or '')[:5], street(addr)
        exact, root = name(label), fire_root(label)
        operator = re.search(r'\b(?:fire|ambulance|ems|rescue|paramedics)\b',exact)
        if not operator or not exact: return []
        out = []
        if town: out.append((by_name,(town,exact)))
        if len(zip5)==5 and zip5.isdigit(): out.append((by_zip,(zip5,exact)))
        if road and zip5 and root and root!=exact: out.append((by_site,(zip5,road,root)))
        return out
    for row in rows:
        key=row[0]
        target=key if key.startswith('FDID:') else ('FDID:'+state+':'+aliases[key] if key in aliases else None)
        if target:
            for index,sig in signatures(row): index[sig].add(target)
    add={}
    for row in rows:
        key=row[0]
        if key.startswith('FDID:') or key in aliases: continue
        choices=set().union(*(index.get(sig,set()) for index,sig in signatures(row)))
        if len(choices)==1: add[key]=choices.pop()

    # For independent EMS operators, join a named state operating license to a single
    # named billing organization at the same street, city and ZIP. Keep different NPIs independent.
    exact_sites=defaultdict(list)
    for row in rows:
        k,label,city,zip_,addr=row
        if k in aliases or k in add or not re.search(r'\b(?:ems|ambulance|paramedics)\b',name(label)):continue
        if not city or not zip_ or not street(addr):continue
        exact_sites[(name(label),token(city),zip_[:5],street(addr))].append(k)
    for keys in exact_sites.values():
        npis=[k for k in keys if k.startswith('NPI:')]
        licenses=[k for k in keys if k.startswith(('STATE-EMS:','TX-DSHS:license:','NY-WREMSCO:'))]
        if len(npis)==len(licenses)==1:add[licenses[0]]=npis[0]
    if state=='FL':
        # Cape Canaveral FY2024–25 adopted budget explicitly identifies the licensee's DBA.
        # Cross-check both source rows against their common headquarters in this release.
        license_row=next(r for r in rows if r[0]=='STATE-EMS:FL:license:502')
        fire_row=next(r for r in rows if r[0]=='FDID:FL:19011')
        if name(license_row[1])=='cape canaveral volunteer fire department' and name(fire_row[1])=='canaveral fire rescue' and street(license_row[4])==street(fire_row[4])=='8970columbiard':
            add[license_row[0]]=fire_row[0]
    result[state]=add
out=data/'providerSiteAliases.json'
content=json.dumps(result,sort_keys=True,separators=(',',':'))+'\n'
if '--check' in sys.argv:
    if out.read_text()!=content:sys.exit('Provider site aliases are out of date')
else:out.write_text(content)
print(sum(map(len,result.values())), 'additional source identities')
