# Data build pipeline (workstation only)

Produces the offline map artifacts the app ships:
`crown-bc.pmtiles`, `tenures-bc.pmtiles`, `basemap-bc.pmtiles`, and a hosting
`manifest.json`. **This never runs on device** (spec §4).

> ⚠️ These jobs download **multiple GB** (ParcelMap BC parcel fabric + the BC
> OpenStreetMap extract) and need lots of disk, RAM, and time. Run on a
> workstation, not CI.

## Prerequisites

| Tool | Install (macOS) | Used by |
|------|-----------------|---------|
| GDAL (`ogr2ogr`, `ogrinfo`) | `brew install gdal` | crown filter/reproject |
| tippecanoe | `brew install tippecanoe` | crown + tenure tiling |
| pmtiles CLI | `brew install pmtiles` | inspection / verification |
| Java 21+ | `brew install temurin` | planetiler (basemap) |
| planetiler.jar | auto-downloaded by `04_basemap.sh` | basemap |
| Python 3 | preinstalled / `brew install python` | tenure paging + manifest |

## Run order

```bash
cd pipeline

# 0. ALWAYS inspect the ownership schema first (spec §6 step 2) and set
#    CROWN_OWNER_VALUES in env.sh to the real "public land" values.
./01_fetch_and_filter_crown.sh --inspect

# 1..5 — or just run_all.sh once CROWN_OWNER_VALUES is confirmed.
./01_fetch_and_filter_crown.sh     # download + filter crown -> work/crown.fgb
./02_tile_crown.sh                 # -> out/crown-bc.pmtiles
./03_fetch_tile_tenures.sh         # paged WFS -> out/tenures-bc.pmtiles
./04_basemap.sh                    # planetiler -> out/basemap-bc.pmtiles
./05_style_manifest.sh             # sizes + fonts + out/manifest.json

# or:
./run_all.sh
```

Config (zoom levels, URLs, owner values, output dirs) lives in `env.sh` and can
be overridden with environment variables.

## Validation (spec §6, important)

BC is ~94% crown land, so crown polygons should cover most of the province. After
building, **visually compare 2–3 sample areas against crownlandmap.ca**. If your
ownership filter only yields sparse titled parcels, the filter is wrong — see the
spec §6 fallback (province boundary minus private/municipal/federal parcels).
**Flag that to a human before implementing; it is heavier.**

Inspect any archive:

```bash
pmtiles show out/crown-bc.pmtiles
```

## Output sizes

`05_style_manifest.sh` prints the size of every artifact and records exact byte
counts + SHA-256 in `manifest.json`. Copy the reported sizes into the top-level
`README.md` (spec §12 acceptance #7).

## Hosting

Upload `out/*.pmtiles` and `out/manifest.json` to any static host / object store
(spec §8). Set that base URL as `MANIFEST_BASE_URL` when running
`05_style_manifest.sh`, and update the app's `BUNDLED_MANIFEST.baseUrl`.

## Region packs (recommended default, spec §8/§14)

`make_region_packs.sh` clips each artifact to a region bbox and re-emits smaller
per-region PMTiles so users can control storage. See that script's header for the
region list; it mirrors the region ids used in the app's manifest.
