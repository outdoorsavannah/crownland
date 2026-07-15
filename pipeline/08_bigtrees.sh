#!/usr/bin/env bash
# Step 8: build the BC BigTree Registry point layer (conifers + broadleaves + dead).
#
# Sources are UBC-published .xlsx files that must be downloaded manually (their
# server blocks automated fetches):
#   https://bigtrees.forestry.ubc.ca/bc-bigtree-registry/
# Set the paths below (defaults under pipeline/data/):
#   BIGTREES_CONIFERS_XLSX    (default: pipeline/data/BCBT_conifers.xlsx)
#   BIGTREES_BROADLEAVES_XLSX (default: pipeline/data/BCBT_broadleaves.xlsx)
#   BIGTREES_DEAD_XLSX        (default: pipeline/data/BCBT_dead.xlsx)
# Conifers is required; the other two are optional (skipped if absent).
#
# Output is written straight into the APP BUNDLE (app/public/packs/bigtrees.pmtiles)
# as one file with three source-layers (bigtrees / bigtrees_broadleaves /
# bigtrees_dead) because big trees is a tiny province-wide layer we ship bundled +
# always-available, not a per-region download. Attribution: BC BigTree Registry,
# UBC Faculty of Forestry — shown in the app's About panel.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd tippecanoe
require_cmd python3

CONIFERS="${BIGTREES_CONIFERS_XLSX:-$HERE/data/BCBT_conifers.xlsx}"
BROADLEAVES="${BIGTREES_BROADLEAVES_XLSX:-$HERE/data/BCBT_broadleaves.xlsx}"
DEAD="${BIGTREES_DEAD_XLSX:-$HERE/data/BCBT_dead.xlsx}"
APP_PACKS="$HERE/../app/public/packs"
OUT="$APP_PACKS/bigtrees.pmtiles"

if [[ ! -f "$CONIFERS" ]]; then
  die "Big-tree conifer xlsx not found at $CONIFERS. Download the registries from
  https://bigtrees.forestry.ubc.ca/bc-bigtree-registry/
  and set BIGTREES_CONIFERS_XLSX (and optionally BIGTREES_BROADLEAVES_XLSX /
  BIGTREES_DEAD_XLSX) to their paths."
fi

mkdir -p "$APP_PACKS"

# (source-layer, xlsx path) pairs → per-layer GeoJSON, then one multi-layer tile.
tip_layers=()
add_layer() {
  local layer="$1" xlsx="$2"
  [[ -f "$xlsx" ]] || { log "skipping $layer (no file at $xlsx)"; return; }
  local gj="$WORK_DIR/${layer}.geojson"
  log "Converting $(basename "$xlsx") → $layer points"
  python3 "$HERE/xlsx_to_geojson.py" "$xlsx" "$gj"
  tip_layers+=(-L "${layer}:${gj}")
}

add_layer bigtrees "$CONIFERS"
add_layer bigtrees_broadleaves "$BROADLEAVES"
add_layer bigtrees_dead "$DEAD"

log "Tiling big trees → $OUT (z4–14)"
# Points; -r1 keeps every tree at every zoom (only ~1.8k features, tiny tiles).
tippecanoe \
  -o "$OUT" -f \
  -Z4 -z14 \
  -r1 \
  -B4 \
  "${tip_layers[@]}"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
