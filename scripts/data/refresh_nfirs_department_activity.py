"""Aggregate primary NFIRS report rows from the official USFA 2024 all-incident layer."""

from concurrent.futures import ThreadPoolExecutor
import gzip
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

LAYER = ("https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/"
         "NFIRS_PDR_Light_Service_2024/FeatureServer/0")
STATES = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split()
PAGE_SIZE = 1000


def department_report_counts(state, rescue=False):
    where = f"STATE='{state}' AND EXP_NO=0"
    if rescue:
        where += " AND INC_TYPE LIKE '3%'"
    stats = [{"statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "row_count"}]
    counts = {}
    offset = 0
    while True:
        query = urlencode({
            "f": "json", "where": where, "groupByFieldsForStatistics": "FDID",
            "outStatistics": json.dumps(stats), "returnGeometry": "false",
            "resultRecordCount": PAGE_SIZE, "resultOffset": offset, "orderByFields": "FDID",
        })
        for attempt in range(4):
            try:
                with urlopen(f"{LAYER}/query?{query}", timeout=80) as response:
                    page = json.load(response)
                break
            except (HTTPError, URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        if "error" in page:
            raise ValueError(f"NFIRS {state}: {page['error']}")
        features = page["features"]
        for feature in features:
            row = feature["attributes"]
            fdid, count = row["FDID"], row["row_count"]
            if not re.fullmatch(r"[A-Z0-9]{5}", fdid or ""):
                continue
            if fdid in counts or type(count) is not int or count <= 0:
                raise ValueError(f"Invalid or duplicate NFIRS count for {state}:{fdid}")
            counts[fdid] = count
        if len(features) < PAGE_SIZE and not page.get("exceededTransferLimit"):
            return counts
        if not features:
            raise ValueError(f"NFIRS paging stalled for {state}")
        offset += len(features)


def state_activity(state):
    reports = department_report_counts(state)
    rescue = department_report_counts(state, rescue=True)
    if any(count > reports.get(fdid, 0) for fdid, count in rescue.items()):
        raise ValueError(f"NFIRS rescue subset exceeds all primary incident rows for {state}")
    print(f"{state}: {len(reports)} department IDs, {sum(reports.values())} primary reports", flush=True)
    return {fdid: [count, rescue.get(fdid, 0)] for fdid, count in sorted(reports.items())}


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as pool:
        by_state = dict(zip(STATES, pool.map(state_activity, STATES)))
    if sum(len(records) for records in by_state.values()) < 8000:
        raise ValueError("NFIRS dataset returned an incomplete department snapshot")
    output = Path(__file__).resolve().parents[2] / "artifacts/ems-territory-intelligence/build/data/nfirs-2024.json.gz"
    output.write_bytes(gzip.compress(json.dumps(by_state, separators=(",", ":")).encode(), mtime=0))
