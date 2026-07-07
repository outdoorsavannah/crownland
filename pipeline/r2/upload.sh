#!/usr/bin/env bash
# Upload built PMTiles + manifest.json to a Cloudflare R2 bucket (spec §8 host).
#
# Prereq: rclone with an R2 remote configured (S3-compatible):
#   rclone config  ->  new remote, type "s3", provider "Cloudflare",
#   endpoint https://<accountid>.r2.cloudflarestorage.com, keys from R2 API token.
#
# Env:
#   R2_REMOTE   rclone remote name           (default: r2)
#   R2_BUCKET   bucket name                  (required)
# All archives land at the bucket ROOT so file names resolve against the app's
# baseUrl directly.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../env.sh"; source "$HERE/../lib.sh"

require_cmd rclone
: "${R2_BUCKET:?Set R2_BUCKET to your bucket name}"
R2_REMOTE="${R2_REMOTE:-r2}"
DEST="$R2_REMOTE:$R2_BUCKET"

upload() {
  local src="$1"
  [[ -e "$src" ]] || return 0
  log "Uploading $(basename "$src") → $DEST/"
  # --s3-no-check-bucket avoids a HeadBucket that R2 tokens often can't do.
  # Explicit content-type so nothing is served as text/html.
  rclone copyto "$src" "$DEST/$(basename "$src")" \
    --s3-no-check-bucket \
    --header-upload "Content-Type: $(content_type "$src")" \
    --progress
}

content_type() {
  case "$1" in
    *.pmtiles) echo "application/octet-stream" ;;
    *.json)    echo "application/json" ;;
    *)         echo "application/octet-stream" ;;
  esac
}

# Whole-BC + top-level artifacts
for f in "$OUT_DIR"/*.pmtiles "$OUT_DIR"/manifest.json; do
  [[ -e "$f" ]] && upload "$f"
done
# Region packs
if [[ -d "$OUT_DIR/regions" ]]; then
  for f in "$OUT_DIR"/regions/*.pmtiles; do
    [[ -e "$f" ]] && upload "$f"
  done
fi

log "Upload complete."
log "Verify Range support:  curl -I -H 'Range: bytes=0-1' <baseUrl>crown-bc.pmtiles"
log "(expect: HTTP/2 206 + Content-Range + Accept-Ranges: bytes)"
