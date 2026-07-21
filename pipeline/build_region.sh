#!/usr/bin/env bash
# Build ONE region's OGMA + VRI region packs in a single command.
#
#   ./build_region.sh skeena
#
# Why this exists: OGMA and VRI reach the app by two different paths, and it is
# easy to build only one of them for a region (that is how a build can end up
# with, say, only Vancouver Island covered):
#
#   * OGMA  is fetched whole-province once (07_fetch_tile_oldgrowth.sh) and then
#           CLIPPED per region.
#   * VRI   is too big province-wide, so 09_vri.sh builds it PER REGION directly.
#
# This wrapper does both for the named region, pulling the bbox from regions.sh
# so it always matches the app manifest (no hand-typed bbox to get wrong).
#
# Prereqs (workstation only — never on device): pmtiles + tippecanoe + GDAL, and
# for VRI a downloaded VEG_COMP_LYR_R1_POLY geodatabase pointed to by VRI_SRC
# (see env.sh / 09_vri.sh). Set SKIP_VRI=1 to build only OGMA (e.g. if you have
# not downloaded the VRI source yet).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"; source "$HERE/regions.sh"

require_cmd pmtiles

REGION="${1:-}"
if [[ -z "$REGION" ]]; then
  die "usage: ./build_region.sh <region-id>
  known regions:
$(region_ids | sed 's/^/    /')"
fi

if ! read -r W S E N < <(region_bbox "$REGION"); then
  die "unknown region '$REGION'. Known regions:
$(region_ids | sed 's/^/    /')"
fi
BBOX_COMMA="$W,$S,$E,$N"
BBOX_SPACE="$W $S $E $N"
REGIONS_DIR="$OUT_DIR/regions"
mkdir -p "$REGIONS_DIR"
log "Region $REGION  bbox: $BBOX_COMMA"

# ---- OGMA: build whole-BC once (if missing) then clip this region ------------
OGMA_BC="$OUT_DIR/oldgrowth-bc.pmtiles"
OGMA_OUT="$REGIONS_DIR/oldgrowth-$REGION.pmtiles"
if [[ ! -f "$OGMA_BC" ]]; then
  warn "$OGMA_BC not found — fetching + tiling whole-province OGMA first."
  "$HERE/07_fetch_tile_oldgrowth.sh"
fi
log "Clipping OGMA -> $(basename "$OGMA_OUT")"
pmtiles extract "$OGMA_BC" "$OGMA_OUT" --bbox="$BBOX_COMMA"
log "  wrote $(basename "$OGMA_OUT") ($(human_size "$(file_bytes "$OGMA_OUT")"))"

# ---- VRI: build this region directly via 09_vri.sh ---------------------------
if [[ "${SKIP_VRI:-0}" == "1" ]]; then
  warn "SKIP_VRI=1 — skipping VRI for $REGION (OGMA only)."
else
  log "Building VRI for $REGION (09_vri.sh)"
  VRI_REGION="$REGION" VRI_BBOX="$BBOX_SPACE" "$HERE/09_vri.sh"
fi

log "Done: region '$REGION'."
log "Next: ./05_style_manifest.sh (record bytes + sha256), then upload"
log "      out/regions/oldgrowth-$REGION.pmtiles + vri-$REGION.pmtiles + manifest.json"
