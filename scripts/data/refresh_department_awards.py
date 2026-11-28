"""Refresh the compact national OpenFEMA source edition used by the profile build."""
import gzip
import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

SOURCE = "https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants"
ENTITY = "NonDisasterAssistanceFirefighterGrants"
OUTPUT = Path(__file__).resolve().parents[2] / "artifacts/ems-territory-intelligence/build/data/department-awards.json.gz"


def page(offset, limit):
    params = {"$filter": "fiscalYear ge 2020 and programName eq 'Assistance to Firefighters Grants'",
              "$orderby": "id asc", "$top": limit, "$skip": offset, "$count": "true",
              "$select": "id,awardNumber,vendorState,vendorName,awardAmount,fiscalYear"}
    with urlopen(SOURCE + "?" + urlencode(params), timeout=90) as response:
        return json.load(response)


def main():
    first = page(0, 1000)
    total = first["metadata"]["count"]
    records = first[ENTITY]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for batch in pool.map(lambda offset: page(offset, 1000), range(1000, total, 1000)):
            if batch["metadata"]["count"] != total:
                raise ValueError("Source changed during pagination")
            records.extend(batch[ENTITY])
    if not total or len(records) != total or len({r["id"] for r in records}) != total:
        raise ValueError("Incomplete or duplicated award edition")
    edition = {"checked": first["metadata"]["rundate"][:10], "firstFiscalYear": 2020, "records": records}
    payload = json.dumps(edition, separators=(",", ":"), ensure_ascii=False).encode()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=OUTPUT.parent, delete=False) as tmp:
        tmp.write(gzip.compress(payload, mtime=0))
    os.replace(tmp.name, OUTPUT)
    print(f"Retained {total:,} source awards through {edition['checked']}")


if __name__ == "__main__":
    main()
