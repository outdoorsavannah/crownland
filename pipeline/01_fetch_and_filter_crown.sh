#!/usr/bin/env bash
# Step 1–2 (spec §6), OWNERSHIP-FILTER model (matches crownlandmap.ca).
# Extracts crown PARCELS from the ParcelMap fabric, reprojected to EPSG:4326:
#   work/crown.fgb : parcels whose OWNER_TYPE is a crown type (CROWN_OWNER_VALUES)
# These render as discrete green parcels over the basemap — the crownlandmap look.
#
# Usage:
#   ./01_fetch_and_filter_crown.sh --inspect   # print distinct owner values, stop
#   ./01_fetch_and_filter_crown.sh             # build crown.fgb
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd ogr2ogr
require_cmd ogrinfo
require_cmd unzip

ZIP="$WORK_DIR/parcel_fabric.zip"
GDB_DIR="$WORK_DIR/parcel_fabric_gdb"
CROWN_FGB="$WORK_DIR/crown.fgb"

fetch "$PARCEL_FABRIC_URL" "$ZIP"

if [[ ! -d "$GDB_DIR" ]]; then
  log "Unzipping parcel fabric …"
  mkdir -p "$GDB_DIR"
  unzip -q -o "$ZIP" -d "$GDB_DIR"
fi

GDB="$(find "$GDB_DIR" -maxdepth 3 -type d -name '*.gdb' | head -1)"
[[ -n "$GDB" ]] || die "Could not find a .gdb in $GDB_DIR"
LAYER="$(ogrinfo -q "$GDB" | awk 'NR==1{print $2}')"
log "Using FileGDB: $GDB (layer: $LAYER)"

OWNER_FIELD="$(ogrinfo -so "$GDB" "$LAYER" \
  | grep -Eio '^[[:space:]]*[A-Za-z_]*OWNER[A-Za-z_]*' \
  | head -1 | tr -d '[:space:]')"
OWNER_FIELD="${OWNER_FIELD:-OWNER_TYPE}"

if [[ "${1:-}" == "--inspect" ]]; then
  log "Detected owner field: $OWNER_FIELD — distinct values + area (km²):"
  ogrinfo -q -dialect SQLite -sql \
    "SELECT \"$OWNER_FIELD\" AS owner, COUNT(*) AS parcels, ROUND(SUM(ST_Area(SHAPE))/1e6) AS km2 FROM \"$LAYER\" GROUP BY owner ORDER BY km2 DESC" \
    "$GDB" | grep -iE "owner|parcels|km2" | sed 's/^/    /'
  warn "Inspection only. Confirm CROWN_OWNER_VALUES in env.sh, then re-run."
  exit 0
fi

# ---- Crown parcels (the green layer) ----
IFS=',' read -ra VALS <<< "$CROWN_OWNER_VALUES"
IN_LIST=""
for v in "${VALS[@]}"; do
  v="$(echo "$v" | sed "s/^ *//;s/ *$//;s/'/''/g")"
  IN_LIST+="${IN_LIST:+,}'$v'"
done
log "Extracting crown parcels: $OWNER_FIELD IN ($IN_LIST)"
rm -f "$CROWN_FGB"
ogr2ogr \
  -f FlatGeobuf "$CROWN_FGB" "$GDB" "$LAYER" \
  -t_srs EPSG:4326 \
  -dialect SQLite \
  -sql "SELECT SHAPE, \"$OWNER_FIELD\" AS OWNER_TYPE FROM \"$LAYER\" WHERE \"$OWNER_FIELD\" IN ($IN_LIST)" \
  -nlt PROMOTE_TO_MULTI -makevalid
log "Wrote $CROWN_FGB ($(human_size "$(file_bytes "$CROWN_FGB")"))"
log "Next: ./02_tile_crown.sh"
