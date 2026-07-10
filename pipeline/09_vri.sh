#!/usr/bin/env bash
# Step 9: derive "old growth by age" from the BC Vegetation Resources Inventory.
#
# VRI is the ONLY open (OGL-BC) dataset that identifies old growth across all of
# BC — every forest polygon carries PROJ_AGE_1. (The TAP "old forests" /
# ancient-forest layers are "Access Only" and cannot be redistributed.)
#
# Source: VEG_COMP_LYR_R1_POLY, a ~4.2 GB file-geodatabase ZIP:
#   https://pub.data.gov.bc.ca/datasets/02dba161-fdb7-48ae-a4bb-bd6ef017c36d/current/
# It is far too heavy for WFS (the server 504s above ~2k features), so we read it
# with GDAL. We stream straight out of the .zip via /vsizip — no 20 GB unzip.
#
# Whole province is huge; normally you build one region at a time:
#   VRI_SRC=work/VEG_COMP_LYR_R1_POLY_2025.gdb.zip \
#   VRI_REGION=vancouver-island VRI_BBOX="-128.8 48.3 -123.0 51.1" ./09_vri.sh
# Omit VRI_REGION to build whole-BC (out/vri-bc.pmtiles) — needs lots of disk.
#
# Pre-filters to PROJ_AGE_1 >= VRI_MIN_AGE (default 140, the interior old-growth
# floor). The app's two sliders then filter age/height at runtime.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd ogr2ogr
require_cmd tippecanoe

[[ -e "$VRI_SRC" ]] || die "VRI source not found at VRI_SRC=$VRI_SRC
  Download VEG_COMP_LYR_R1_POLY (Vegetation Resources Inventory, OGL-BC) from
  https://pub.data.gov.bc.ca/datasets/02dba161-fdb7-48ae-a4bb-bd6ef017c36d/current/"

# ---- Resolve the OGR datasource: read the .gdb inside the .zip in place ----
case "$VRI_SRC" in
  *.zip)
    inner="$(unzip -Z1 "$VRI_SRC" 2>/dev/null | grep -oE '^[^/]+\.gdb' | head -1)"
    [[ -n "$inner" ]] || die "No .gdb found inside $VRI_SRC"
    DSN="/vsizip/$(cd "$(dirname "$VRI_SRC")" && pwd)/$(basename "$VRI_SRC")/$inner"
    ;;
  *) DSN="$VRI_SRC" ;;
esac
log "OGR datasource: $DSN"

# ---- Resolve the layer name (VRI ships it suffixed by year) ----
LAYER="${VRI_LAYER:-}"
if [[ -z "$LAYER" ]]; then
  # ogrinfo prints either "1: NAME (geom)" or "Layer: NAME (geom)". Anchor to
  # those lines so we don't pick the .gdb filename out of the "Open of ..." line.
  LAYER="$(ogrinfo -so "$DSN" 2>/dev/null \
    | grep -E '^(Layer:|[0-9]+:)' \
    | grep -oE '[A-Za-z0-9_]*VEG_COMP[A-Za-z0-9_]*' | head -1)"
  [[ -n "$LAYER" ]] || die "Could not auto-detect the VRI layer; set VRI_LAYER."
fi
log "VRI layer: $LAYER"

# ---- Region vs whole-province output ----
if [[ -n "${VRI_REGION:-}" ]]; then
  [[ -n "${VRI_BBOX:-}" ]] || die "VRI_REGION set but VRI_BBOX missing (\"w s e n\")."
  require_cmd gdaltransform
  mkdir -p "$OUT_DIR/regions"
  OUT="$OUT_DIR/regions/vri-$VRI_REGION.pmtiles"
  FILTERED="$WORK_DIR/vri_$VRI_REGION.fgb"

  # GDAL forbids -spat_srs together with -sql, so project the lon/lat bbox into
  # the layer's native SRS (BCGW is BC Albers) and pass -spat in native units.
  # Corners + edge midpoints, then a small buffer, since a lon/lat box does not
  # project to a rectangle.
  read -r _w _s _e _n <<< "$VRI_BBOX"
  _mx="$(python3 -c "print(($_w + $_e) / 2)")"
  _my="$(python3 -c "print(($_s + $_n) / 2)")"
  SPAT_BBOX="$(printf '%s %s\n%s %s\n%s %s\n%s %s\n%s %s\n%s %s\n%s %s\n%s %s\n' \
      "$_w" "$_s" "$_e" "$_s" "$_w" "$_n" "$_e" "$_n" \
      "$_mx" "$_s" "$_mx" "$_n" "$_w" "$_my" "$_e" "$_my" \
    | gdaltransform -s_srs EPSG:4326 -t_srs "$VRI_NATIVE_SRS" 2>/dev/null \
    | python3 -c "
import sys
xs, ys = [], []
for line in sys.stdin:
    p = line.split()
    if len(p) >= 2:
        xs.append(float(p[0])); ys.append(float(p[1]))
b = 2000  # metres of slack for projection curvature
print(f'{min(xs)-b:.0f} {min(ys)-b:.0f} {max(xs)+b:.0f} {max(ys)+b:.0f}')
")"
  [[ -n "$SPAT_BBOX" ]] || die "Failed to project VRI_BBOX into $VRI_NATIVE_SRS"
  # shellcheck disable=SC2086
  SPAT=(-spat $SPAT_BBOX)
  log "Region: $VRI_REGION  bbox(4326): $VRI_BBOX  ->  spat($VRI_NATIVE_SRS): $SPAT_BBOX"
else
  OUT="$OUT_DIR/vri-bc.pmtiles"
  FILTERED="$WORK_DIR/vri_bc.fgb"
  SPAT=()
  warn "Building WHOLE province — this needs a lot of disk and time."
fi

log "Extracting polygons with age >= $VRI_MIN_AGE (scans the inventory; slow)"
rm -f "$FILTERED"
ogr2ogr -f FlatGeobuf "$FILTERED" "$DSN" \
  -sql "SELECT PROJ_AGE_1 AS age, PROJ_HEIGHT_1 AS height, SPECIES_CD_1 AS species
        FROM $LAYER WHERE PROJ_AGE_1 >= $VRI_MIN_AGE" \
  "${SPAT[@]+"${SPAT[@]}"}" \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -progress

log "Filtered: $(human_size "$(file_bytes "$FILTERED")")"

log "Tiling → $OUT (z$VRI_MINZOOM–$VRI_MAXZOOM)"
# Broad context wash, not a survey layer: simplify hard, cap tile bytes.
tippecanoe \
  -o "$OUT" -f \
  -l vri \
  -Z "$VRI_MINZOOM" -z "$VRI_MAXZOOM" \
  -T age:int -T height:float \
  --simplification=12 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=500000 \
  "$FILTERED"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
log "Then: ./05_style_manifest.sh && upload vri-*.pmtiles + manifest.json"
