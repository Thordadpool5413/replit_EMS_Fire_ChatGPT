"""Refresh the bundled Texas A&M Forest Service HB 2604 final approval tables."""

import gzip
import json
from pathlib import Path
import re
import subprocess

BASE = "https://tfsweb.tamu.edu/wp-content/uploads/"
EDITIONS = (
    ("2025-10-14", "2025/10/FY26-Funding-Meeting-1-October-14-2025-Funding-Summary.pdf", 879),
    ("2026-02-13", "2026/02/FY26-Equipment-Round-3-February-13-2026-Funding-Summary-1.pdf", 708),
)
ROW = re.compile(r"^\s*(\d+)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+?)\s+\$\s*([\d,]+\.\d{2})\s*$")


def read_edition(date, path, expected):
    url = BASE + path
    document = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "60", url],
        capture_output=True, check=True,
    ).stdout
    output = subprocess.run(
        ["pdftotext", "-layout", "-", "-"], input=document, capture_output=True, check=True
    ).stdout.decode("utf-8")
    if "Final Approvals:" not in output:
        raise ValueError(f"Final approval table missing from {url}")
    rows = []
    for page_number, page in enumerate(output.split("\f"), start=1):
        for line in page.splitlines():
            match = ROW.fullmatch(line)
            if match:
                index, recipient, county, purpose, amount = match.groups()
                rows.append({
                    "index": int(index), "page": page_number, "recipient": recipient,
                    "county": county, "purpose": purpose, "amount": float(amount.replace(",", "")),
                })
    if [row["index"] for row in rows] != list(range(1, expected + 1)):
        raise ValueError(f"Non-contiguous or incomplete approval table in {url}")
    return {"date": date, "url": url, "rows": rows}


if __name__ == "__main__":
    payload = [read_edition(*edition) for edition in EDITIONS]
    output = Path(__file__).resolve().parents[2] / (
        "artifacts/ems-territory-intelligence/build/data/texas-fire-grants.json.gz"
    )
    output.write_bytes(gzip.compress(json.dumps(payload, separators=(",", ":")).encode(), mtime=0))
