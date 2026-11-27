"""Match unique fire and ambulance listings by exact organization name and city within state."""
import base64
import gzip
import json
from collections import defaultdict
from pathlib import Path

app = Path("artifacts/ems-territory-intelligence")
registry = app / "public/registry"
billing = defaultdict(set)
fire = defaultdict(list)
for part in (registry / "nppes").glob("part-*.gz.b64"):
    for line in gzip.decompress(base64.b64decode(part.read_bytes())).splitlines():
        row = json.loads(line)
        if row["deactivationDate"] and not row["reactivationDate"]:
            continue
        place = row["location"]
        for name in (row["legalName"], row["alternateName"]):
            if name and place["city"]:
                billing[place["state"], place["city"].strip().casefold(), name.strip().casefold()].add(row["npi"])
for part in (registry / "national").glob("??.json"):
    for identifier, source, name, state, city, *_ in json.loads(part.read_text()):
        if source == "USFA" and city:
            fire[state, city.strip().casefold(), name.strip().casefold()].append(identifier.replace("usfa:", "FDID:"))
pairs = [(ids[0], next(iter(billing[key]))) for key, ids in fire.items() if len(ids) == len(billing[key]) == 1]
from collections import Counter
counts = Counter(npi for _, npi in pairs)
matches = {identifier: npi for identifier, npi in pairs if counts[npi] == 1}
(app / "src/data/fireBillingIdentityMatches.json").write_text(json.dumps(matches, indent=2, sort_keys=True) + "\n")
print(len(matches), "unique matches")
