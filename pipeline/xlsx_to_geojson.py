#!/usr/bin/env python3
"""Convert a BC BigTree Registry .xlsx into a GeoJSON point layer.

Handles all three registry exports (conifers, broadleaves, dead), whose column
headers differ (e.g. the dead list uses "Tree"/"Name"/"dia_m" where the living
lists use "common_name"/"tree_nickname"/"DBH_(m)"). Each output key accepts a
list of possible header aliases.

Stdlib only (no openpyxl) — an .xlsx is a zip of XML. Keeps a compact set of
attributes for the app's tap sheet, and only emits trees that have valid
coordinates within BC (the registry withholds ~10% of locations; those are
skipped). Coordinates are NAD83, treated as WGS84 (sub-metre difference in BC).

Usage: xlsx_to_geojson.py INPUT.xlsx OUTPUT.geojson
Data:  BC BigTree Registry, UBC Faculty of Forestry (https://bigtrees.forestry.ubc.ca)
"""
import sys, json, zipfile, re
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# output property key -> accepted header aliases (first match in the sheet wins).
# Covers the conifer/broadleaf exports and the differently-named dead export.
KEEP = {
    "species": ("common_name", "Tree"),
    "nickname": ("tree_nickname", "Name"),
    "score": ("tree_score",),
    "height_m": ("height_(m)", "height_m"),
    "dbh_m": ("DBH_(m)", "dia_m"),
    "crown_m": ("crown_spread_(m)", "crown_spr_m"),
    "town": ("nearest_town",),
    "ownership": ("ownership",),
    "elevation_m": ("elevation_m",),
    "measured": ("last_measured", "year-meas"),
    "id": ("tree_registry_id", "ID#"),
}
NUMERIC = {"score", "height_m", "dbh_m", "crown_m", "elevation_m"}


def read_rows(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    def colnum(ref):
        s = 0
        for ch in re.match(r"([A-Z]+)", ref).group(1):
            s = s * 26 + (ord(ch) - 64)
        return s - 1

    for row in root.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            v = c.find(f"{NS}v")
            val = v.text if v is not None else None
            if c.get("t") == "s" and val is not None:
                val = shared[int(val)]
            cells[colnum(c.get("r"))] = val
        yield cells


def num(x):
    # Tolerant leading-number parse: some cells carry a unit mark (e.g. the
    # broadleaf score 398"), so a bare float() would drop them.
    if x is None:
        return None
    m = re.match(r"-?\d+(\.\d+)?", str(x).strip())
    return float(m.group()) if m else None


def main():
    src, out = sys.argv[1], sys.argv[2]
    rows = read_rows(src)
    header = next(rows)
    idx = {(header.get(i) or "").strip(): i for i in header}
    lat_i, lng_i = idx.get("latitude"), idx.get("longitude")
    if lat_i is None or lng_i is None:
        sys.exit("could not find latitude/longitude columns")

    # Resolve each output key to the sheet column of its first matching alias.
    col = {}
    for key, aliases in KEEP.items():
        for name in aliases:
            if name in idx:
                col[key] = idx[name]
                break

    feats, skipped = [], 0
    for cells in rows:
        lat, lng = num(cells.get(lat_i)), num(cells.get(lng_i))
        # Require a plausible BC coordinate; drop withheld/blank/garbage.
        if lat is None or lng is None or not (47 <= lat <= 61) or not (-140 <= lng <= -113):
            skipped += 1
            continue
        props = {}
        for key, ci in col.items():
            raw = cells.get(ci)
            if raw is None or str(raw).strip() == "":
                continue
            props[key] = round(num(raw), 2) if key in NUMERIC and num(raw) is not None else str(raw).strip()
        feats.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
        })

    json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
    print(f"wrote {len(feats)} big-tree points ({skipped} skipped: no/invalid coords)")


if __name__ == "__main__":
    main()
