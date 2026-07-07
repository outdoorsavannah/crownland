#!/usr/bin/env bash
# Shared configuration for the BC Crown Land data pipeline (spec §6).
# Copy to a private env if you want to override paths; these are the defaults.

# Where big intermediate downloads/extracts live (NOT committed).
export WORK_DIR="${WORK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/work}"

# Where final shipped artifacts are written.
export OUT_DIR="${OUT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/out}"

# Tile zoom ranges (spec §6 step 3).
export CROWN_MINZOOM="${CROWN_MINZOOM:-5}"
export CROWN_MAXZOOM="${CROWN_MAXZOOM:-14}"
export TENURE_MINZOOM="${TENURE_MINZOOM:-6}"
export TENURE_MAXZOOM="${TENURE_MAXZOOM:-14}"
export BASEMAP_MINZOOM="${BASEMAP_MINZOOM:-0}"
export BASEMAP_MAXZOOM="${BASEMAP_MAXZOOM:-14}"

# planetiler JVM heap. Keep small on low-RAM boxes (e.g. a 4 GB Pi) — the basemap
# step uses memory-mapped storage so most data lives off-heap on disk.
export PLANETILER_XMX="${PLANETILER_XMX:-2g}"

# Data source URLs (spec §5). Pinned; override if BC republishes.
export PARCEL_FABRIC_URL="https://pub.data.gov.bc.ca/datasets/4cf233c2-f020-4f7a-9b87-1923252fbc24/pmbc_parcel_fabric_poly_svw.zip"
export TENURES_WFS_BASE="https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CROWN_TENURES_SVW/ows"
export OSM_PBF_URL="https://download.geofabrik.de/north-america/canada/british-columbia-latest.osm.pbf"

# OWNERSHIP-FILTER MODEL (matches crownlandmap.ca: green = discrete crown
# PARCELS on a basemap, NOT a province-wide blanket). Crown = these owner types.
# "Untitled Provincial" is the largest crown category (~44k km²) and MUST be
# included — omitting it is what made the first attempt look sparse. VERIFY names
# with 01_fetch_and_filter_crown.sh --inspect.
export CROWN_OWNER_VALUES="${CROWN_OWNER_VALUES:-Crown Provincial,Untitled Provincial,Crown Agency}"

# Cloudflare R2 hosting (spec §8). MANIFEST_BASE_URL is baked into manifest.json
# and MUST match VITE_MANIFEST_BASE_URL in the app's .env. Use your custom domain
# (or pub-<hash>.r2.dev for testing). Must end with a slash.
export MANIFEST_BASE_URL="${MANIFEST_BASE_URL:-https://crownland.outdoorsavannah.com/}"
export R2_REMOTE="${R2_REMOTE:-r2}"     # rclone remote name (see r2/upload.sh)
export R2_BUCKET="${R2_BUCKET:-}"        # target bucket name

# On macOS, Homebrew's openjdk isn't symlinked into /usr/bin without sudo, so
# `java` resolves to the stub that errors. If a real JDK isn't on PATH, add a
# brew openjdk to it so planetiler (04) can run.
if ! java -version >/dev/null 2>&1; then
  for _jdk in /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21 \
              /opt/homebrew/opt/openjdk /usr/local/opt/openjdk; do
    if [ -x "$_jdk/bin/java" ]; then
      export PATH="$_jdk/bin:$PATH"
      export JAVA_HOME="$_jdk/libexec/openjdk.jdk/Contents/Home"
      break
    fi
  done
fi

mkdir -p "$WORK_DIR" "$OUT_DIR"
