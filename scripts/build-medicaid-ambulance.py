"""Build HHS ambulance billing snapshots from the official 2026-02-09 HCPCS Parquet
and provider-source-coverage.csv produced by map-provider-source-coverage.mts.
Usage: python scripts/build-medicaid-ambulance.py downloaded.parquet provider-source-coverage.csv
Requires duckdb. Run from the repository root.
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import duckdb

out = Path("artifacts/ems-territory-intelligence/public/data/medicaid")
out.mkdir(exist_ok=True)
geography = {}
with open(sys.argv[2], encoding="utf-8-sig") as source:
    for listing in csv.DictReader(source):
        key = listing["registry_key"]
        if key.startswith("NPI:"):
            geography[key[4:]] = (listing["state"], listing["county_fips"])

db = duckdb.connect(config={"threads": 2, "memory_limit": "400MB"})
rows = db.execute("""
    SELECT CAST(BILLING_PROVIDER_NPI_NUM AS VARCHAR), LEFT(CAST(CLAIM_FROM_MONTH AS VARCHAR), 4),
           SUM(TOTAL_CLAIM_LINES), CAST(SUM(CAST(TOTAL_PAID AS DECIMAL(18,2))) * 100 AS BIGINT)
    FROM read_parquet(?)
    WHERE HCPCS_CODE IN ('A0425','A0426','A0427','A0428','A0429','A0430','A0431',
                         'A0432','A0433','A0434','A0435','A0436')
    GROUP BY 1, 2 ORDER BY 1, 2
""", [sys.argv[1]]).fetchall()

shards = defaultdict(dict)
areas = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
for npi, year, lines, cents in rows:
    if npi not in geography:
        continue
    state, county = geography[npi]
    shards[npi[:2]].setdefault(npi, {})[year] = [lines, cents]
    for area in filter(None, ("US", state, county)):
        totals = areas[area][year]
        totals[0] += lines
        totals[1] += cents
        totals[2] += 1

def save(name, data):
    (out / (name + ".json")).write_text(json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n")

for prefix in range(10, 20):
    save(str(prefix), shards[str(prefix)])
save("areas", areas)
print(sum(map(len, shards.values())), "distinct matched billing NPIs;", len(areas), "reporting areas")
