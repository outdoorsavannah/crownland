#!/usr/bin/env bash
# Step 8: build the BC BigTree Registry (conifers) point layer.
#
# Source is a UBC-published .xlsx that must be downloaded manually (their server
# blocks automated fetches):
#   https://bigtrees.forestry.ubc.ca/bc-bigtree-registry/conifers/
# Set BIGTREES_XLSX to its path (default: pipeline/data/BCBT_conifers.xlsx).
#
# Output is written straight into the APP BUNDLE (app/public/packs/bigtrees.pmtiles)
# because big trees is a tiny province-wide layer we ship bundled + always-on,
# not a per-region download. Attribution: BC BigTree Registry, UBC Faculty of
# Forestry — shown in the app's About panel.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd tippecanoe
require_cmd python3

XLSX="${BIGTREES_XLSX:-$HERE/data/BCBT_conifers.xlsx}"
APP_PACKS="$HERE/../app/public/packs"
GEOJSON="$WORK_DIR/bigtrees.geojson"
OUT="$APP_PACKS/bigtrees.pmtiles"

if [[ ! -f "$XLSX" ]]; then
  die "Big-tree xlsx not found at $XLSX. Download the conifer registry from
  https://bigtrees.forestry.ubc.ca/bc-bigtree-registry/conifers/
  and set BIGTREES_XLSX to its path (or place it at pipeline/data/BCBT_conifers.xlsx)."
fi

mkdir -p "$APP_PACKS"
log "Converting $(basename "$XLSX") → GeoJSON points"
python3 "$HERE/xlsx_to_geojson.py" "$XLSX" "$GEOJSON"

log "Tiling big trees → $OUT (z4–14)"
# Points; -r1 keeps every tree at every zoom (only ~1.5k features, tiny tiles).
tippecanoe \
  -o "$OUT" -f \
  -l bigtrees \
  -Z4 -z14 \
  -r1 \
  -B4 \
  "$GEOJSON"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
