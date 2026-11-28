"""Retain published 2024 CMS ambulance service rows by billing NPI."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

DATASET = "92396110-2aed-4d63-a6a2-5d6207d46a29"
API = f"https://data.cms.gov/data-api/v1/dataset/{DATASET}/data"
CODES = ("A0422", "A0424", "A0425", "A0426", "A0427", "A0428", "A0429",
         "A0430", "A0431", "A0432", "A0433", "A0434", "A0435", "A0436",
         "A0888", "A0998", "A0999")
STATS = ("Tot_Benes", "Tot_Srvcs", "Tot_Bene_Day_Srvcs", "Avg_Sbmtd_Chrg",
         "Avg_Mdcr_Alowd_Amt", "Avg_Mdcr_Pymt_Amt")
PAGE_SIZE = 3000


def rows_for_code(code):
    offset = 0
    seen = set()
    while True:
        query = urlencode({"filter[HCPCS_Cd]": code, "filter[Rndrng_Prvdr_Ent_Cd]": "O",
                           "size": PAGE_SIZE, "offset": offset})
        for attempt in range(4):
            try:
                with urlopen(f"{API}?{query}", timeout=65) as response:
                    page = json.load(response)
                break
            except (HTTPError, URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        for row in page:
            npi = row["Rndrng_NPI"]
            place = row["Place_Of_Srvc"]
            if (row["HCPCS_Cd"] != code or row["Rndrng_Prvdr_Ent_Cd"] != "O"
                    or not re.fullmatch(r"\d{10}", npi) or place not in ("F", "O")
                    or (npi, place) in seen):
                raise ValueError(f"Invalid or duplicate {code} row for {npi}")
            seen.add((npi, place))
            yield row
        if len(page) < PAGE_SIZE:
            print(f"{code}: {len(seen)} organization rows", flush=True)
            return
        offset += len(page)


def main():
    with ThreadPoolExecutor(max_workers=6) as pool:
        pages = list(pool.map(lambda code: list(rows_for_code(code)), CODES))
    providers = {}
    descriptions = {}
    for rows in pages:
        for row in rows:
            if row["Rndrng_Prvdr_Cntry"] != "US":
                continue
            npi, code = row["Rndrng_NPI"], row["HCPCS_Cd"]
            descriptions[code] = row["HCPCS_Desc"]
            profile = providers.setdefault(npi, [
                row["Rndrng_Prvdr_Last_Org_Name"].strip(), row["Rndrng_Prvdr_City"],
                row["Rndrng_Prvdr_State_Abrvtn"], row["Rndrng_Prvdr_Type"], [],
            ])
            profile[4].append([code, row["Place_Of_Srvc"], *[
                round(float(row[column]), 4) if row[column] else None for column in STATS
            ]])
    if len(providers) < 5000 or "A0429" not in descriptions:
        raise ValueError("CMS dataset returned an incomplete provider snapshot")
    folder = Path(__file__).resolve().parents[2] / "artifacts/ems-territory-intelligence/build/data"
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # Prefix shards can be refreshed as a complete edition and cached independently.
    for digit in sorted({npi[1] for npi in providers}):
        rows = {npi: data for npi, data in sorted(providers.items()) if npi[1] == digit}
        payload = {"checked": checked, "dataset": DATASET, "codes": descriptions, "providers": rows}
        target = folder / f"medicare-2024-{digit}.json.gz"
        staging = target.with_suffix(".tmp")
        staging.write_bytes(gzip.compress(json.dumps(payload, separators=(",", ":")).encode(), mtime=0))
        os.replace(staging, target)
    print(f"Retained {len(providers)} billing NPIs", flush=True)


if __name__ == "__main__":
    main()
