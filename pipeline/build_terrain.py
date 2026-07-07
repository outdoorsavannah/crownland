#!/usr/bin/env python3
"""Build a terrain-RGB PMTiles archive for a bbox from AWS Terrarium tiles.

MapLibre renders hillshade from this at runtime (source type raster-dem,
encoding "terrarium") — fully offline. Terrarium tiles are already elevation-RGB
encoded, so we just fetch the XYZ pyramid, pack into an MBTiles, and convert to
PMTiles with the `pmtiles` CLI.

Usage:
  build_terrain.py <west> <south> <east> <north> <maxzoom> <out.pmtiles>
Requires: pmtiles CLI on PATH.
"""
import math, os, sqlite3, sys, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

TILE_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"
MINZOOM = 0


def deg2tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def fetch(z, x, y):
    url = TILE_URL.format(z=z, x=x, y=y)
    try:
        with urlopen(Request(url, headers={"User-Agent": "crownland-pipeline"}), timeout=30) as r:
            return z, x, y, r.read()
    except (HTTPError, URLError):
        return z, x, y, None


def main():
    w, s, e, n = map(float, sys.argv[1:5])
    maxzoom = int(sys.argv[5])
    out = sys.argv[6]

    jobs = []
    for z in range(MINZOOM, maxzoom + 1):
        x0, y0 = deg2tile(w, n, z)  # north/west
        x1, y1 = deg2tile(e, s, z)  # south/east
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                jobs.append((z, x, y))
    print(f"terrain: {len(jobs)} tiles z{MINZOOM}-{maxzoom} for bbox {w},{s},{e},{n}")

    tmp = tempfile.NamedTemporaryFile(suffix=".mbtiles", delete=False)
    tmp.close()
    db = sqlite3.connect(tmp.name)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INT, tile_column INT, tile_row INT, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    for k, v in {
        "name": "terrain", "format": "png", "type": "baselayer",
        "minzoom": str(MINZOOM), "maxzoom": str(maxzoom),
        "bounds": f"{w},{s},{e},{n}",
    }.items():
        db.execute("INSERT INTO metadata VALUES (?,?)", (k, v))

    done = miss = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for z, x, y, data in ex.map(lambda j: fetch(*j), jobs):
            if data is None:
                miss += 1
                continue
            # MBTiles uses TMS (y flipped).
            tms_y = (2 ** z - 1) - y
            db.execute("INSERT OR REPLACE INTO tiles VALUES (?,?,?,?)", (z, x, tms_y, data))
            done += 1
            if done % 500 == 0:
                db.commit()
                print(f"  {done}/{len(jobs)} …")
    db.commit()
    db.close()
    print(f"terrain: fetched {done}, missing {miss} (ocean/none)")

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(["pmtiles", "convert", tmp.name, out], check=True)
    os.remove(tmp.name)
    print(f"terrain: wrote {out} ({os.path.getsize(out) // (1 << 20)} MB)")


if __name__ == "__main__":
    main()
