#!/usr/bin/env bash
# Region packs (spec §8/§14 recommended default): clip the whole-BC PMTiles into
# smaller per-region archives so users control storage. Uses `pmtiles extract`
# with a bbox, which pulls just the tiles inside the region out of the big
# archive — no re-tiling needed.
#
# Region ids/bboxes mirror the app's BUNDLED_MANIFEST region packs.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd pmtiles

REGIONS_DIR="$OUT_DIR/regions"
mkdir -p "$REGIONS_DIR"

# id  west  south  east  north   (matches app/src/data/manifest.ts)
REGIONS=(
  "vancouver-island -128.8 48.3 -123.0 51.1"
  "lower-mainland   -123.6 48.9 -121.0 50.2"
  "thompson-okanagan -121.5 48.9 -117.5 52.0"
  "kootenay         -118.0 48.9 -114.0 51.5"
  "cariboo          -126.0 51.0 -119.0 54.0"
  "skeena           -133.5 52.5 -126.0 56.5"
  "northeast        -126.0 54.0 -119.9 60.0"
)

extract() {
  local src="$1" out="$2" bbox="$3"
  [[ -f "$src" ]] || { warn "skip: $src not built"; return; }
  log "  $(basename "$out")"
  pmtiles extract "$src" "$out" --bbox="$bbox"
}

for row in "${REGIONS[@]}"; do
  read -r id w s e n <<< "$row"
  bbox="$w,$s,$e,$n"
  log "Region $id ($bbox)"
  extract "$OUT_DIR/basemap-bc.pmtiles"   "$REGIONS_DIR/basemap-$id.pmtiles"   "$bbox"
  extract "$OUT_DIR/crown-bc.pmtiles"     "$REGIONS_DIR/crown-$id.pmtiles"     "$bbox"
  extract "$OUT_DIR/tenures-bc.pmtiles"   "$REGIONS_DIR/tenures-$id.pmtiles"   "$bbox"
  extract "$OUT_DIR/oldgrowth-bc.pmtiles" "$REGIONS_DIR/oldgrowth-$id.pmtiles" "$bbox"
  extract "$OUT_DIR/terrain-bc.pmtiles"   "$REGIONS_DIR/terrain-$id.pmtiles"   "$bbox"
done

log "Region packs written to $REGIONS_DIR"
log "Report their sizes and add per-region entries (bytes + sha256) to the manifest."
