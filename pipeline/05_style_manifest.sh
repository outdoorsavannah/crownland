#!/usr/bin/env bash
# Step 6 (spec §6): report sizes, generate the hosting manifest.json (with
# sha256 + byte sizes for the app's checksum/versioning), and install local
# glyphs so labels render offline (spec §10).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh"; source "$HERE/lib.sh"

APP_FONTS="$HERE/../app/public/fonts"
MANIFEST_VERSION="${MANIFEST_VERSION:-$(date +%Y.%m.%d)}"
BASE_URL="${MANIFEST_BASE_URL}"

# ---- 1. Report sizes (spec §6 step 6, §12 acceptance #7) ----
log "Output artifact sizes:"
for f in "$OUT_DIR"/*.pmtiles; do
  [[ -e "$f" ]] || continue
  printf '    %-28s %s\n' "$(basename "$f")" "$(human_size "$(file_bytes "$f")")"
done

# ---- 2. Install glyphs (fonts) for offline labels ----
if [[ ! -d "$APP_FONTS/Noto Sans Regular" ]]; then
  log "Fetching offline glyph set (Noto Sans) …"
  mkdir -p "$APP_FONTS"
  TMP_FONTS="$WORK_DIR/fonts.zip"
  # Prebuilt PBF glyphs from the openmaptiles/fonts release.
  curl -fL --retry 3 -o "$TMP_FONTS" \
    "https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip" || \
    warn "Font download failed — provide a {fontstack}/{range}.pbf set at app/public/fonts manually."
  [[ -f "$TMP_FONTS" ]] && unzip -q -o "$TMP_FONTS" -d "$APP_FONTS" || true
fi

# ---- 3. Generate manifest.json ----
MANIFEST="$OUT_DIR/manifest.json"
log "Writing $MANIFEST"
python3 - "$OUT_DIR" "$MANIFEST" "$MANIFEST_VERSION" "$BASE_URL" <<'PY'
import json, os, sys, hashlib, glob
out_dir, manifest_path, version, base_url = sys.argv[1:5]

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

regions_dir = os.path.join(out_dir, "regions")

def entry(dir_, name):
    p = os.path.join(dir_, name)
    if not os.path.exists(p):
        return None
    # url is the bare file name — everything is uploaded to the bucket root, so
    # it resolves against baseUrl directly.
    return {"file": name, "url": name, "bytes": os.path.getsize(p), "sha256": sha256(p)}

def archives_for(dir_, suffix):
    a = {}
    for kind in ("basemap", "crown", "tenures", "oldgrowth", "vri", "terrain"):
        e = entry(dir_, f"{kind}-{suffix}.pmtiles")
        if e:
            a[kind] = e
    return a

packs = []

# 1. Built-in sample — bundled in the app, NOT hosted. Kept in the manifest so it
#    stays in the pack list after the app switches to the remote manifest.
packs.append({
    "id": "sample",
    "name": "Built-in sample",
    "description": "Bundled with the app — no download. Not real crown data.",
    "bbox": [-123.6, 48.3, -123.0, 48.7],
    "archives": {k: {"file": f"{k}-sample.pmtiles", "url": f"packs/{k}-sample.pmtiles",
                     "bytes": 0, "sha256": "", "bundled": True}
                 for k in ("basemap", "crown", "tenures", "oldgrowth")},
})

# 2. Region packs (spec §8/§14). ids/bboxes MIRROR app/src/data/manifest.ts —
#    keep them in sync. Only emitted if the split files exist in out/regions.
REGIONS = [
    ("vancouver-island", "Vancouver Island",        [-128.8, 48.3, -123.0, 51.1]),
    ("lower-mainland",   "Lower Mainland / Fraser",  [-123.6, 48.9, -121.0, 50.2]),
    ("thompson-okanagan","Thompson-Okanagan",        [-121.5, 48.9, -117.5, 52.0]),
    ("kootenay",         "Kootenay",                 [-118.0, 48.9, -114.0, 51.5]),
    ("cariboo",          "Cariboo",                  [-126.0, 51.0, -119.0, 54.0]),
    ("skeena",           "Skeena",                   [-133.5, 52.5, -126.0, 56.5]),
    ("northeast",        "Northeast",                [-126.0, 54.0, -119.9, 60.0]),
]
for rid, name, bbox in REGIONS:
    a = archives_for(regions_dir, rid)
    if a:
        packs.append({"id": rid, "name": name,
                      "description": "Region pack. Basemap + crown + tenures + old growth.",
                      "bbox": bbox, "archives": a})

# 3. Whole-BC pack, if built.
bc = archives_for(out_dir, "bc")
if bc:
    packs.append({
        "id": "whole-bc",
        "name": "Whole British Columbia",
        "description": "Everything. Large download — check free space first.",
        "bbox": [-139.1, 48.2, -114.0, 60.0],
        "archives": bc,
    })

manifest = {
    "schema": 1,
    "version": version,
    "baseUrl": base_url,
    "attribution": {
        "ogl": "Contains information licensed under the Open Government Licence – British Columbia",
        "osm": "© OpenStreetMap contributors (ODbL)",
    },
    "packs": packs,
}
json.dump(manifest, open(manifest_path, "w"), indent=2)
hosted = sum(1 for p in packs for a in p["archives"].values() if not a.get("bundled"))
print(f"wrote manifest: {len(packs)} packs, {hosted} hosted archives")
PY

log "Done. Upload artifacts to R2:  R2_BUCKET=<bucket> ./r2/upload.sh"
log "Set VITE_MANIFEST_BASE_URL in app/.env to $BASE_URL and rebuild the app."
