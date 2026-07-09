#!/usr/bin/env bash
# Step 9: derive an "old-growth by age" layer from the BC Vegetation Resources
# Inventory (VRI). Output: out/vri-bc.pmtiles (source-layer "vri").
#
# VRI is ~4-5 million polygons (tens of GB) distributed as a file geodatabase,
# so it CANNOT be paged over WFS and needs GDAL. Download it manually from the
# BC Data Catalogue (search "VEG_COMP_LYR_R1_POLY" / Vegetation Resources
# Inventory, Open Government Licence – BC) and point VRI_SRC at it:
#   VRI_SRC=/path/to/VRI.gdb ./09_vri.sh
#
# We pre-filter to PROJ_AGE_1 >= VRI_MIN_AGE (default 140, the old-growth floor)
# to keep the tiles feasible, and keep only age/height/species. The app's two
# sliders then filter by min age + min height at runtime (no re-download).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd ogr2ogr   # GDAL — reads the VRI geodatabase
require_cmd tippecanoe

[[ -e "$VRI_SRC" ]] || die "VRI source not found at VRI_SRC=$VRI_SRC.
  Download VEG_COMP_LYR_R1_POLY (Vegetation Resources Inventory) from the BC Data
  Catalogue and set VRI_SRC to the .gdb / .gpkg path."

FILTERED="$WORK_DIR/vri_oldgrowth.fgb"
OUT="$OUT_DIR/vri-bc.pmtiles"

log "Extracting VRI polygons with age >= $VRI_MIN_AGE (this is the slow, big step)"
# Reproject to WGS84, keep a lean attribute set, drop everything younger than the
# floor. PROMOTE_TO_MULTI so mixed single/multi polygons tile cleanly.
ogr2ogr -f FlatGeobuf "$FILTERED" "$VRI_SRC" \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -dialect OGRSQL \
  -sql "SELECT PROJ_AGE_1 AS age, PROJ_HEIGHT_1 AS height, SPECIES_CD_1 AS species
        FROM \"$VRI_LAYER\" WHERE PROJ_AGE_1 >= $VRI_MIN_AGE"

log "Tiling VRI old growth → $OUT (z$VRI_MINZOOM–$VRI_MAXZOOM)"
# Simplify hard and drop the densest polygons at low zoom — this is a broad
# context wash, not a survey layer. age/height are preserved for the sliders.
tippecanoe \
  -o "$OUT" -f \
  -l vri \
  -Z "$VRI_MINZOOM" -z "$VRI_MAXZOOM" \
  --simplification=12 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=500000 \
  "$FILTERED"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
log "Then: ./make_region_packs.sh && ./05_style_manifest.sh && upload."
