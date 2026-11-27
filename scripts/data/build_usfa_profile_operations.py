#!/usr/bin/env python3
"""Prepare a dated operations supplement from the retained national USFA export."""

import argparse
from collections import defaultdict
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import unicodedata
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "scripts/data/evidence/usfa-native-national/2026-11-26"
PUBLIC = ROOT / "artifacts/ems-territory-intelligence/public/registry"
FIELDS = (
    "Number Of Stations",
    "Active Firefighters - Career",
    "Active Firefighters - Volunteer",
    "Active Firefighters - Paid per Call",
    "Non-Firefighting - Civilian",
    "Non-Firefighting - Volunteer",
)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def clean(value):
    return " ".join(unicodedata.normalize("NFKC", value or "").split()).casefold()


def number(value):
    value = value.strip()
    return int(value) if re.fullmatch(r"[0-9]{1,6}", value) else None


def build():
    manifest = json.loads((ARCHIVE / "manifest.json").read_text())
    raw_archive = (ARCHIVE / "original.zip").read_bytes()
    if digest(raw_archive) != manifest["archiveSha256"]:
        raise ValueError("Unexpected USFA archive digest")
    with ZipFile(io.BytesIO(raw_archive)) as archive:
        raw = archive.read("source/usfa-national.csv")
    if digest(raw) != manifest["sourceSha256"]:
        raise ValueError("Unexpected USFA archive member digest")

    records = defaultdict(list)
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="strict")), skipinitialspace=True):
        key = row["HQ state"], row["FDID"]
        records[key].append(row)

    directory_hashes = {}
    shards = [dict() for _ in range(6)]
    directory_index = json.loads((PUBLIC / "national/index.json").read_text())
    for state in sorted(directory_index["byState"]):
        path = PUBLIC / "national" / (state + ".json")
        group = (ord(state[0]) + ord(state[1])) % len(shards)
        found = {}
        directory = path.read_bytes()
        directory_hashes[state] = digest(directory)
        for key, source, name, _, city, postal, _, _, _, _, street, _ in json.loads(directory):
            if source != "USFA":
                continue
            native = records[(state, key.removeprefix(f"usfa:{state}:"))]
            if len(native) != 1:
                continue
            row = native[0]
            if (clean(row["Fire dept name"]), clean(row["HQ city"]), row["HQ zip"][:5], clean(row["HQ addr1"])) != (
                clean(name), clean(city), postal[:5], clean(street)
            ):
                continue
            found[key] = [row["Dept Type"].strip() or None, *(number(row[field]) for field in FIELDS)]
        if found:
            shards[group][state] = found

    output = {"index.json": b""}
    index = {"schemaVersion": 1, "retrievedAt": "2026-11-26", "sourceSha256": digest(raw), "states": {}}
    for n, group in enumerate(shards):
        filename = f"operations-{n}.json.gz"
        compressed = gzip.compress(json.dumps(group, separators=(",", ":"), ensure_ascii=False).encode(), mtime=0)
        output[filename] = compressed
        for state, rows in group.items():
            index["states"][state] = {
                "file": filename, "count": len(rows), "sha256": digest(compressed),
                "directorySha256": directory_hashes[state],
            }
    output["index.json"] = (json.dumps(index, indent=2) + "\n").encode()
    return output, sum(value["count"] for value in index["states"].values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    output, count = build()
    target = PUBLIC / "usfa-operations"
    if args.verify:
        expected_index = json.loads(output["index.json"])
        for filename, expected in output.items():
            if filename == "index.json":
                continue
            current = (target / filename).read_bytes()
            if gzip.decompress(current) != gzip.decompress(expected):
                raise ValueError(f"Published USFA operations data does not reproduce: {filename}")
            for state in expected_index["states"].values():
                if state["file"] == filename:
                    state["sha256"] = digest(current)
        if json.loads((target / "index.json").read_bytes()) != expected_index:
            raise ValueError("Published USFA operations index does not reproduce")
    else:
        target.mkdir(parents=True, exist_ok=True)
        for filename, data in output.items():
            (target / filename).write_bytes(data)
    print(f"{count:,} exact USFA registry identities with dated operations data")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        sys.exit(str(error))
