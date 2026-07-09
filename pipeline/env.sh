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
export OLDGROWTH_MINZOOM="${OLDGROWTH_MINZOOM:-5}"
export OLDGROWTH_MAXZOOM="${OLDGROWTH_MAXZOOM:-14}"
export VRI_MINZOOM="${VRI_MINZOOM:-7}"
export VRI_MAXZOOM="${VRI_MAXZOOM:-13}"
export BASEMAP_MINZOOM="${BASEMAP_MINZOOM:-0}"
export BASEMAP_MAXZOOM="${BASEMAP_MAXZOOM:-14}"

# VRI (Vegetation Resources Inventory) — old-growth-by-age source. Huge (4-5M
# polygons); download the file geodatabase manually from the BC Data Catalogue
# ("VEG_COMP_LYR_R1_POLY", OGL-BC) and set VRI_SRC to it. We pre-filter to
# PROJ_AGE_1 >= VRI_MIN_AGE at build time to keep it feasible; the app's age/
# height sliders filter the rest at runtime. Needs GDAL (ogr2ogr).
export VRI_SRC="${VRI_SRC:-$OUT_DIR/../data/VRI.gdb}"
export VRI_LAYER="${VRI_LAYER:-VEG_COMP_LYR_R1_POLY}"
export VRI_MIN_AGE="${VRI_MIN_AGE:-140}"

# planetiler JVM heap. Keep small on low-RAM boxes (e.g. a 4 GB Pi) — the basemap
# step uses memory-mapped storage so most data lives off-heap on disk.
export PLANETILER_XMX="${PLANETILER_XMX:-2g}"

# Data source URLs (spec §5). Pinned; override if BC republishes.
export PARCEL_FABRIC_URL="https://pub.data.gov.bc.ca/datasets/4cf233c2-f020-4f7a-9b87-1923252fbc24/pmbc_parcel_fabric_poly_svw.zip"
export TENURES_WFS_BASE="https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CROWN_TENURES_SVW/ows"
export OSM_PBF_URL="https://download.geofabrik.de/north-america/canada/british-columbia-latest.osm.pbf"

# Old-growth overlay = Old Growth Management Areas (legal, current). This is the
# OPEN (OGL-BC) old-growth layer, so it can be tiled, hosted and bundled like
# crown/tenures. NOTE: the Old Growth Strategic Review "TAP" datasets (priority
# deferral / ancient forest / big-treed) are licensed "Access Only" — reproduction
# needs written BC permission — so they are deliberately NOT used here.
export OGMA_WFS_BASE="${OGMA_WFS_BASE:-https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW/ows}"
# Non-legal (proposed / draft) OGMAs — also OGL-BC. Tiled as a second layer
# ("oldgrowth_nonlegal") inside the same oldgrowth-*.pmtiles archive.
export OGMA_NONLEGAL_WFS_BASE="${OGMA_NONLEGAL_WFS_BASE:-https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_NON_LEGAL_CURRENT_SVW/ows}"

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
