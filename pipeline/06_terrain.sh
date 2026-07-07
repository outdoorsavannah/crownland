#!/usr/bin/env bash
# Step 6: build the whole-BC terrain-RGB archive for offline hillshade.
# Output: out/terrain-bc.pmtiles  (MapLibre raster-dem, encoding "terrarium").
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd pmtiles
require_cmd python3

# BC terrestrial extent (matches the whole-bc pack bbox).
BC_BBOX_W="${BC_BBOX_W:--139.1}"
BC_BBOX_S="${BC_BBOX_S:-48.2}"
BC_BBOX_E="${BC_BBOX_E:--114.0}"
BC_BBOX_N="${BC_BBOX_N:-60.0}"
# Hillshade is low-frequency; z10 (~150 m) gives full relief at a quarter the
# size of z11. MapLibre overzooms it smoothly at higher zooms.
TERRAIN_MAXZOOM="${TERRAIN_MAXZOOM:-10}"

OUT="$OUT_DIR/terrain-bc.pmtiles"
log "Building BC terrain (z0-$TERRAIN_MAXZOOM) → $OUT"
python3 "$HERE/build_terrain.py" \
  "$BC_BBOX_W" "$BC_BBOX_S" "$BC_BBOX_E" "$BC_BBOX_N" "$TERRAIN_MAXZOOM" "$OUT"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
