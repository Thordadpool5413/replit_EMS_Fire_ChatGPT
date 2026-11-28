"""Build the Census 2020 statistical ZIP-area to single land county crosswalk."""

import csv
import gzip
import io
import json
from pathlib import Path
from urllib.request import urlopen

URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"


if __name__ == "__main__":
    with urlopen(URL, timeout=60) as response:
        source = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig"), delimiter="|")
        areas = {}
        for row in source:
            zip_area, county = row["GEOID_ZCTA5_20"], row["GEOID_COUNTY_20"]
            if zip_area and county and int(row["AREALAND_PART"]) > 0:
                areas.setdefault(zip_area, set()).add(county)
    one_county = {code: next(iter(counties)) for code, counties in sorted(areas.items()) if len(counties) == 1}
    if not 20000 < len(one_county) < 34000:
        raise ValueError("Unexpected Census crosswalk size")
    output = Path(__file__).resolve().parents[2] / "artifacts/ems-territory-intelligence/build/data/single-county-zcta.json.gz"
    output.write_bytes(gzip.compress(json.dumps(one_county, separators=(",", ":")).encode(), mtime=0))
    print(f"{len(one_county)} statistical ZIP areas contained in a single land county")
