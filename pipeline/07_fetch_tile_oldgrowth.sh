#!/usr/bin/env bash
# Step 7: fetch Old Growth Management Areas (legal, current) via the paged WFS
# GeoJSON, then tile. Output: out/oldgrowth-bc.pmtiles
#
# OGMA legal = the legally-designated old-growth reserves. Open Government Licence
# – British Columbia, so it can be redistributed offline like crown/tenures.
# (The OGSR "TAP" priority-deferral datasets are "Access Only" and are NOT used.)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd curl
require_cmd tippecanoe
require_cmd python3

PAGE=10000
TYPENAME="pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW"
PAGES_DIR="$WORK_DIR/oldgrowth_pages"
MERGED="$WORK_DIR/oldgrowth.geojson"
OUT="$OUT_DIR/oldgrowth-bc.pmtiles"
mkdir -p "$PAGES_DIR"

# Page through WFS 2.0.0 with count + startIndex until a short page comes back.
start=0
idx=0
while : ; do
  page_file="$PAGES_DIR/page_$(printf '%05d' "$idx").json"
  if [[ ! -s "$page_file" ]]; then
    log "Fetching OGMA startIndex=$start count=$PAGE"
    # sortBy=OBJECTID for stable paging (same reason as tenures — startIndex
    # without a stable sort is rejected).
    curl -fsSL -o "$page_file" \
      "$OGMA_WFS_BASE?service=WFS&version=2.0.0&request=GetFeature&typeNames=$TYPENAME&outputFormat=application/json&srsName=EPSG:4326&sortBy=OBJECTID&count=$PAGE&startIndex=$start"
  fi
  n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["features"]))' "$page_file")"
  log "  page $idx: $n features"
  [[ "$n" -lt "$PAGE" ]] && break
  start=$(( start + PAGE )); idx=$(( idx + 1 ))
done

# Merge pages, keeping a lean attribute subset for the tap sheet.
log "Merging OGMA pages → $MERGED"
python3 - "$PAGES_DIR" "$MERGED" <<'PY'
import json, glob, os, sys
pages_dir, out = sys.argv[1], sys.argv[2]
# RMP_OGMA_LEGAL_CURRENT_SVW attributes. Verbose change-tracking / annotation
# fields are dropped to keep the tile archive small.
keep = {"LEGAL_OGMA_PROVID","OGMA_TYPE","OGMA_PRIMARY_REASON",
        "LEGALIZATION_FRPA_DATE","ENABLING_DOCUMENT_TITLE","FEATURE_AREA_SQM"}
feats = []
for f in sorted(glob.glob(os.path.join(pages_dir, "page_*.json"))):
    for ft in json.load(open(f)).get("features", []):
        props = ft.get("properties", {}) or {}
        ft["properties"] = {k: v for k, v in props.items() if k in keep}
        feats.append(ft)
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
print(f"merged {len(feats)} OGMA features")
PY

log "Tiling old growth → $OUT (z$OLDGROWTH_MINZOOM–$OLDGROWTH_MAXZOOM)"
# OGMA polygons are reserve boundaries — simplify and cap tile size like tenures.
tippecanoe \
  -o "$OUT" -f \
  -l oldgrowth \
  -Z "$OLDGROWTH_MINZOOM" -z "$OLDGROWTH_MAXZOOM" \
  --coalesce \
  --simplification=10 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=500000 \
  "$MERGED"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
