#!/usr/bin/env bash
# Step 7: fetch Old Growth Management Areas (legal + non-legal, current) via the
# paged WFS GeoJSON, then tile BOTH into out/oldgrowth-bc.pmtiles as two layers:
#   - "oldgrowth"           : legally-designated reserves (RMP_OGMA_LEGAL_CURRENT_SVW)
#   - "oldgrowth_nonlegal"  : proposed / draft reserves  (RMP_OGMA_NON_LEGAL_CURRENT_SVW)
#
# Both are Open Government Licence – British Columbia, so they can be redistributed
# offline. (The OGSR "TAP" priority-deferral datasets are "Access Only" and are
# NOT used.) Keeping them in one archive means the app manifest / region packs /
# download flow are unchanged — only the tileset gains a layer.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd curl
require_cmd tippecanoe
require_cmd python3

PAGE=10000
OUT="$OUT_DIR/oldgrowth-bc.pmtiles"

# Page a WFS layer to GeoJSON, then merge pages into one FeatureCollection
# keeping only $KEEP (comma-separated attribute names).
# args: base_url  typename  pages_dir  merged_out  keep_csv
fetch_layer() {
  local base="$1" typename="$2" pages_dir="$3" merged="$4" keep="$5"
  mkdir -p "$pages_dir"
  local start=0 idx=0 page_file n
  while : ; do
    page_file="$pages_dir/page_$(printf '%05d' "$idx").json"
    if [[ ! -s "$page_file" ]]; then
      log "Fetching $typename startIndex=$start count=$PAGE"
      # sortBy=OBJECTID for stable paging (no primary key otherwise).
      curl -fsSL -o "$page_file" \
        "$base?service=WFS&version=2.0.0&request=GetFeature&typeNames=$typename&outputFormat=application/json&srsName=EPSG:4326&sortBy=OBJECTID&count=$PAGE&startIndex=$start"
    fi
    n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["features"]))' "$page_file")"
    log "  page $idx: $n features"
    [[ "$n" -lt "$PAGE" ]] && break
    start=$(( start + PAGE )); idx=$(( idx + 1 ))
  done

  log "Merging $(basename "$merged") (keep: $keep)"
  KEEP="$keep" python3 - "$pages_dir" "$merged" <<'PY'
import json, glob, os, sys
pages_dir, out = sys.argv[1], sys.argv[2]
keep = set(os.environ["KEEP"].split(","))
feats = []
for f in sorted(glob.glob(os.path.join(pages_dir, "page_*.json"))):
    for ft in json.load(open(f)).get("features", []):
        props = ft.get("properties", {}) or {}
        ft["properties"] = {k: v for k, v in props.items() if k in keep}
        feats.append(ft)
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
print(f"merged {len(feats)} features")
PY
}

LEGAL_MERGED="$WORK_DIR/oldgrowth.geojson"
NONLEGAL_MERGED="$WORK_DIR/oldgrowth_nonlegal.geojson"

fetch_layer "$OGMA_WFS_BASE" "pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW" \
  "$WORK_DIR/oldgrowth_pages" "$LEGAL_MERGED" \
  "LEGAL_OGMA_PROVID,OGMA_TYPE,OGMA_PRIMARY_REASON,LEGALIZATION_FRPA_DATE,ENABLING_DOCUMENT_TITLE,FEATURE_AREA_SQM"

fetch_layer "$OGMA_NONLEGAL_WFS_BASE" "pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_NON_LEGAL_CURRENT_SVW" \
  "$WORK_DIR/oldgrowth_nonlegal_pages" "$NONLEGAL_MERGED" \
  "NON_LEGAL_OGMA_PROVID,OGMA_TYPE,OGMA_PRIMARY_REASON,ORIGINAL_DECISION_DATE,FEATURE_AREA_SQM"

log "Tiling old growth → $OUT (z$OLDGROWTH_MINZOOM–$OLDGROWTH_MAXZOOM, layers: oldgrowth + oldgrowth_nonlegal)"
# OGMA polygons are reserve boundaries — simplify and cap tile size like tenures.
tippecanoe \
  -o "$OUT" -f \
  -L "oldgrowth:$LEGAL_MERGED" \
  -L "oldgrowth_nonlegal:$NONLEGAL_MERGED" \
  -Z "$OLDGROWTH_MINZOOM" -z "$OLDGROWTH_MAXZOOM" \
  --coalesce \
  --simplification=10 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=500000

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
