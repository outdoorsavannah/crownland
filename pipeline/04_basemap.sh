#!/usr/bin/env bash
# Step 5 (spec §6): build the local OSM basemap with planetiler and convert to
# PMTiles. Output: out/basemap-bc.pmtiles
#
# planetiler (Java) can emit PMTiles directly (--output-format=pmtiles in recent
# builds). It downloads the BC .osm.pbf itself given --area or --osm-path.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd java

PLANETILER_JAR="${PLANETILER_JAR:-$WORK_DIR/planetiler.jar}"
PBF="$WORK_DIR/british-columbia-latest.osm.pbf"
OUT="$OUT_DIR/basemap-bc.pmtiles"

if [[ ! -f "$PLANETILER_JAR" ]]; then
  log "Fetching planetiler.jar …"
  curl -fL --retry 3 -o "$PLANETILER_JAR" \
    "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"
fi

fetch "$OSM_PBF_URL" "$PBF"

# Trimmed OpenMapTiles-schema basemap (spec §14: trimmed — water, roads, place
# labels, optional contours). planetiler's default profile already produces a
# lean OMT schema; adjust --exclude-layers to trim further if size is a problem.
#
# --storage=mmap keeps the node/feature maps on disk instead of in RAM, so this
# runs on low-memory machines (e.g. a 4 GB Pi) — slower, but it completes.
# PLANETILER_XMX bounds the JVM heap (default 2g); everything else is off-heap.
log "Running planetiler → $OUT (heap $PLANETILER_XMX, mmap storage)"
java -Xmx"$PLANETILER_XMX" -jar "$PLANETILER_JAR" \
  --osm-path="$PBF" \
  --output="$OUT" \
  --force \
  --storage=mmap \
  --nodemap-type=sparsearray \
  --minzoom="$BASEMAP_MINZOOM" \
  --maxzoom="$BASEMAP_MAXZOOM" \
  --download

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
warn "NOTE: symbol layers need local glyphs. Run ./05_style_manifest.sh to copy"
warn "a font PBF set into app/public/fonts so labels render offline (spec §10)."
