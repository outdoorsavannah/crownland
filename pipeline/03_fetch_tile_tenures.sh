#!/usr/bin/env bash
# Step 4 (spec §6): fetch Crown Tenures via the paged WFS GeoJSON, then tile.
# Output: out/tenures-bc.pmtiles
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

require_cmd curl
require_cmd tippecanoe
require_cmd python3   # used to merge paged JSON without loading all into jq

PAGE=10000
TYPENAME="pub:WHSE_TANTALIS.TA_CROWN_TENURES_SVW"
PAGES_DIR="$WORK_DIR/tenure_pages"
MERGED="$WORK_DIR/tenures.geojson"
OUT="$OUT_DIR/tenures-bc.pmtiles"
mkdir -p "$PAGES_DIR"

# Page through WFS 2.0.0 with count + startIndex until a short page comes back.
start=0
idx=0
while : ; do
  page_file="$PAGES_DIR/page_$(printf '%05d' "$idx").json"
  if [[ ! -s "$page_file" ]]; then
    log "Fetching tenures startIndex=$start count=$PAGE"
    # sortBy is REQUIRED for paging: this layer has no primary key, so the WFS
    # rejects startIndex without a stable sort. OBJECTID is a stable ordinal.
    curl -fsSL -o "$page_file" \
      "$TENURES_WFS_BASE?service=WFS&version=2.0.0&request=GetFeature&typeNames=$TYPENAME&outputFormat=application/json&srsName=EPSG:4326&sortBy=OBJECTID&count=$PAGE&startIndex=$start"
  fi
  n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["features"]))' "$page_file")"
  log "  page $idx: $n features"
  [[ "$n" -lt "$PAGE" ]] && break
  start=$(( start + PAGE )); idx=$(( idx + 1 ))
done

# Merge pages into one FeatureCollection, keeping the attributes in spec §5.
log "Merging tenure pages → $MERGED"
python3 - "$PAGES_DIR" "$MERGED" <<'PY'
import json, glob, os, sys
pages_dir, out = sys.argv[1], sys.argv[2]
# Real TA_CROWN_TENURES_SVW attributes (no CLIENT_NAME in this public layer).
# TENURE_LEGAL_DESCRIPTION is deliberately dropped — it was ~9.4 MB of text that
# blew up the tile archive, and it's too verbose for a mobile tap sheet.
keep = {"INTRID_SID","TENURE_TYPE","TENURE_SUBTYPE","TENURE_PURPOSE",
        "TENURE_SUBPURPOSE","TENURE_STAGE","TENURE_STATUS","CROWN_LANDS_FILE",
        "TENURE_EXPIRY","TENURE_LOCATION","TENURE_AREA_IN_HECTARES"}
feats = []
for f in sorted(glob.glob(os.path.join(pages_dir, "page_*.json"))):
    for ft in json.load(open(f)).get("features", []):
        props = ft.get("properties", {}) or {}
        ft["properties"] = {k: v for k, v in props.items() if k in keep}
        feats.append(ft)
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
print(f"merged {len(feats)} tenure features")
PY

log "Tiling tenures → $OUT (z$TENURE_MINZOOM–$TENURE_MAXZOOM)"
# Tenures are reference outlines, so simplify hard and cap tile size to keep the
# archive small (raw z14 geometry was ~250 MB otherwise).
tippecanoe \
  -o "$OUT" -f \
  -l tenures \
  -Z "$TENURE_MINZOOM" -z "$TENURE_MAXZOOM" \
  --coalesce \
  --simplification=10 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=500000 \
  "$MERGED"

log "Wrote $OUT ($(human_size "$(file_bytes "$OUT")"))"
