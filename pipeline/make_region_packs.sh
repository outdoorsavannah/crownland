#!/usr/bin/env bash
# Region packs (spec §8/§14 recommended default): clip the whole-BC PMTiles into
# smaller per-region archives so users control storage. Uses `pmtiles extract`
# with a bbox, which pulls just the tiles inside the region out of the big
# archive — no re-tiling needed.
#
# Region ids/bboxes mirror the app's BUNDLED_MANIFEST region packs.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"; source "$HERE/regions.sh"

require_cmd pmtiles

REGIONS_DIR="$OUT_DIR/regions"
mkdir -p "$REGIONS_DIR"

# Region ids/bboxes come from regions.sh (shared with build_region.sh and the
# app manifest).

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
  # VRI is normally built PER REGION by 09_vri.sh (province-wide is too big), so
  # a vri-bc.pmtiles usually does not exist. Only clip it if a whole-BC VRI was
  # actually built; otherwise point at the per-region build path instead of
  # silently producing no VRI for the region.
  if [[ -f "$OUT_DIR/vri-bc.pmtiles" ]]; then
    extract "$OUT_DIR/vri-bc.pmtiles"     "$REGIONS_DIR/vri-$id.pmtiles"       "$bbox"
  elif [[ -f "$REGIONS_DIR/vri-$id.pmtiles" ]]; then
    log "  vri-$id.pmtiles already built (09_vri.sh) — keeping"
  else
    warn "  no VRI for $id: build it with  VRI_REGION=$id VRI_BBOX=\"$w $s $e $n\" ./09_vri.sh"
    warn "                          (or:  ./build_region.sh $id )"
  fi
  extract "$OUT_DIR/terrain-bc.pmtiles"   "$REGIONS_DIR/terrain-$id.pmtiles"   "$bbox"
done

log "Region packs written to $REGIONS_DIR"
log "Report their sizes and add per-region entries (bytes + sha256) to the manifest."
