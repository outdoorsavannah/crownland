#!/usr/bin/env bash
# Build the Yukon region pack (basemap + terrain + crown) directly from Yukon
# sources. Yukon is north of BC (60-69.7N), so — unlike the BC regions — its
# layers CANNOT be clipped from the whole-BC archives; each is built here from
# its own source:
#
#   crown   : GeoYukon "Land_Dispositions" (Open Government Licence - Yukon) —
#             leases / agreements-for-sale / easements / reservations on
#             territorial Crown land. Tiled as source-layer "crown" so the app
#             styles it exactly like BC crown (spec §9 / style.ts).
#             NOTE: this is the *disposed* (encumbered) land, not "available
#             Crown land" — Yukon has no single available-Crown-land polygon.
#   basemap : Yukon OSM extract (Geofabrik) via planetiler.
#   terrain : AWS Terrarium tiles (global, incl. >60N) via build_terrain.py.
#
# Prereqs (workstation only): ogr2ogr, tippecanoe, pmtiles, java, python3.
# Skip flags: SKIP_CROWN=1 / SKIP_BASEMAP=1 / SKIP_TERRAIN=1.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"; source "$HERE/regions.sh"

read -r W S E N < <(region_bbox yukon) || die "yukon bbox missing from regions.sh"
REGIONS_DIR="$OUT_DIR/regions"; mkdir -p "$REGIONS_DIR"
log "Yukon bbox: $W $S $E $N"

# ---- crown: Land_Dispositions (GeoYukon, EPSG:3578) -> source-layer "crown" --
if [[ "${SKIP_CROWN:-0}" != "1" ]]; then
  require_cmd ogr2ogr; require_cmd tippecanoe
  ZIP="$WORK_DIR/yukon_land_dispositions.shp.zip"
  fetch "https://map-data.service.yukon.ca/GeoYukon/Land_Tenure/Land_Dispositions/Land_Dispositions.shp.zip" "$ZIP"
  FGB="$WORK_DIR/crown-yukon.fgb"
  log "Reprojecting Land_Dispositions -> EPSG:4326 ($FGB)"
  ogr2ogr -f FlatGeobuf "$FGB" "/vsizip/$ZIP" \
    -t_srs EPSG:4326 -nlt PROMOTE_TO_MULTI -skipfailures
  OUT="$REGIONS_DIR/crown-yukon.pmtiles"
  log "Tiling crown-yukon -> $OUT (z$CROWN_MINZOOM-$CROWN_MAXZOOM)"
  tippecanoe -o "$OUT" -f -l crown \
    -Z "$CROWN_MINZOOM" -z "$CROWN_MAXZOOM" \
    --coalesce --simplification=4 \
    --drop-densest-as-needed --coalesce-densest-as-needed \
    --extend-zooms-if-still-dropping --no-tiny-polygon-reduction \
    "$FGB"
  log "  wrote $(basename "$OUT") ($(human_size "$(file_bytes "$OUT")"))"
fi

# ---- basemap: Yukon OSM via planetiler -------------------------------------
if [[ "${SKIP_BASEMAP:-0}" != "1" ]]; then
  require_cmd java
  PLANETILER_JAR="${PLANETILER_JAR:-$WORK_DIR/planetiler.jar}"
  PBF="$WORK_DIR/yukon-latest.osm.pbf"
  OUT="$REGIONS_DIR/basemap-yukon.pmtiles"
  if [[ ! -f "$PLANETILER_JAR" ]]; then
    log "Fetching planetiler.jar …"
    curl -fL --retry 3 -o "$PLANETILER_JAR" \
      "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"
  fi
  fetch "https://download.geofabrik.de/north-america/canada/yukon-latest.osm.pbf" "$PBF"
  log "Running planetiler -> $OUT (heap $PLANETILER_XMX, mmap storage)"
  java -Xmx"$PLANETILER_XMX" -jar "$PLANETILER_JAR" \
    --osm-path="$PBF" \
    --output="$OUT" \
    --force \
    --storage=mmap \
    --nodemap-type=sparsearray \
    --minzoom="$BASEMAP_MINZOOM" \
    --maxzoom="$BASEMAP_MAXZOOM" \
    --download
  log "  wrote $(basename "$OUT") ($(human_size "$(file_bytes "$OUT")"))"
fi

# ---- terrain: AWS Terrarium (global) for the Yukon bbox --------------------
if [[ "${SKIP_TERRAIN:-0}" != "1" ]]; then
  require_cmd pmtiles; require_cmd python3
  OUT="$REGIONS_DIR/terrain-yukon.pmtiles"
  MZ="${TERRAIN_MAXZOOM:-10}"
  log "Building Yukon terrain (z0-$MZ) -> $OUT"
  python3 "$HERE/build_terrain.py" "$W" "$S" "$E" "$N" "$MZ" "$OUT"
  log "  wrote $(basename "$OUT") ($(human_size "$(file_bytes "$OUT")"))"
fi

log "Done: yukon. Next: ./05_style_manifest.sh, then upload the 3 yukon packs + manifest.json"
