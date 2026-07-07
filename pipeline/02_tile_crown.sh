#!/usr/bin/env bash
# Step 3 (spec §6), OWNERSHIP-FILTER model. Tiles the crown parcels into one
# archive with a single source-layer "crown". Output: out/crown-bc.pmtiles
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd tippecanoe

CROWN_FGB="$WORK_DIR/crown.fgb"
OUT="$OUT_DIR/crown-bc.pmtiles"
[[ -f "$CROWN_FGB" ]] || die "Missing $CROWN_FGB — run ./01_fetch_and_filter_crown.sh first"

log "Tiling crown parcels → $OUT (z$CROWN_MINZOOM–$CROWN_MAXZOOM)"
# --coalesce merges adjacent same-attribute crown parcels; drop/merge density at
# low zoom keeps tiles sane. Crown polygons are the map's main layer, so allow
# them to survive to low zoom.
tippecanoe \
  -o "$OUT" -f \
  -l crown \
  -Z "$CROWN_MINZOOM" -z "$CROWN_MAXZOOM" \
  --coalesce \
  --simplification=4 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tiny-polygon-reduction \
  "$CROWN_FGB"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
