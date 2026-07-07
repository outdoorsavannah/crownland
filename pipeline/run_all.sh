#!/usr/bin/env bash
# Run the whole pipeline end to end (spec §6). Expect this to take a long time
# and a lot of disk — the parcel fabric and BC OSM extract are multi-GB.
#
# IMPORTANT: run the schema inspection first and confirm CROWN_OWNER_VALUES:
#   ./01_fetch_and_filter_crown.sh --inspect
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$HERE/01_fetch_and_filter_crown.sh"
"$HERE/02_tile_crown.sh"
"$HERE/03_fetch_tile_tenures.sh"
"$HERE/04_basemap.sh"
"$HERE/05_style_manifest.sh"

echo
echo "Pipeline complete. Artifacts in pipeline/out/. See README for validation (spec §6)."
