#!/usr/bin/env bash
# One-shot dependency installer for the BC Crown Land pipeline.
# Target: Ubuntu 24.04 (apt), ARM64 or x86_64. Safe to re-run (idempotent).
#
#   cd crownland/pipeline && ./bootstrap.sh
#
# Installs: GDAL, tippecanoe (from source), pmtiles CLI, Java 21, Python 3,
# rclone, and build basics. Verifies everything at the end.
set -euo pipefail

c_g() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_y() { printf '\033[1;33m%s\033[0m\n' "$*"; }
c_r() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ---- macOS (Homebrew) branch ----
if [ "$(uname -s)" = "Darwin" ]; then
  command -v brew >/dev/null 2>&1 || { c_r "Homebrew required: https://brew.sh"; exit 1; }
  c_g "Detected macOS on $(uname -m) — using Homebrew"
  c_g "==> brew install gdal tippecanoe pmtiles python rclone openjdk@21…"
  brew install gdal tippecanoe pmtiles python rclone openjdk@21
  # brew's openjdk isn't symlinked without sudo; env.sh adds it to PATH at runtime.
  c_g "==> Verifying toolchain…"
  JB="$(brew --prefix openjdk@21 2>/dev/null)/bin"
  for t in ogr2ogr tippecanoe pmtiles python3 rclone git; do
    command -v "$t" >/dev/null 2>&1 && printf '  \033[1;32m✓\033[0m %s\n' "$t" || { printf '  \033[1;31m✗ %s\033[0m\n' "$t"; }
  done
  "$JB/java" -version >/dev/null 2>&1 && printf '  \033[1;32m✓\033[0m java (%s)\n' "$JB" || printf '  \033[1;31m✗ java\033[0m\n'
  c_g "Toolchain ready. The pipeline's env.sh adds brew openjdk to PATH automatically."
  c_g "Next: rclone config → ./01_fetch_and_filter_crown.sh --inspect → ./run_all.sh → ./r2/upload.sh"
  exit 0
fi

command -v apt-get >/dev/null 2>&1 || { c_r "This bootstrap targets apt (Ubuntu/Debian) or macOS (Homebrew)."; exit 1; }

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) PM_ARCH_RE='arm64|aarch64' ;;
  x86_64|amd64)  PM_ARCH_RE='x86_64|amd64'  ;;
  *) c_r "Unsupported CPU arch: $ARCH"; exit 1 ;;
esac
c_g "Detected: $(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}") on $ARCH"

# ---- 1. apt packages ----
c_g "==> Installing apt packages (needs sudo)…"
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  git curl ca-certificates unzip jq \
  python3 \
  gdal-bin \
  openjdk-21-jre-headless \
  rclone \
  build-essential libsqlite3-dev zlib1g-dev

# ---- 2. tippecanoe (build from source; not packaged) ----
if command -v tippecanoe >/dev/null 2>&1; then
  c_g "==> tippecanoe already installed ($(tippecanoe --version 2>&1 | head -1))"
else
  c_g "==> Building tippecanoe from source (a few minutes on a Pi)…"
  TMP_TC="$(mktemp -d)"
  git clone --depth 1 https://github.com/felt/tippecanoe.git "$TMP_TC"
  make -C "$TMP_TC" -j"$(nproc)"
  sudo make -C "$TMP_TC" install
  rm -rf "$TMP_TC"
fi

# ---- 3. pmtiles CLI (arch-aware GitHub release) ----
if command -v pmtiles >/dev/null 2>&1; then
  c_g "==> pmtiles already installed ($(pmtiles version 2>&1 | head -1))"
else
  c_g "==> Installing pmtiles CLI for $ARCH…"
  PM_URL="$(curl -fsSL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | jq -r '.assets[].browser_download_url' \
    | grep -iE 'linux' | grep -iE "$PM_ARCH_RE" | grep -iE '\.tar\.gz$' | head -1)"
  [ -n "$PM_URL" ] || { c_r "Could not find a pmtiles release asset for $ARCH"; exit 1; }
  TMP_PM="$(mktemp -d)"
  curl -fsSL "$PM_URL" | tar -xz -C "$TMP_PM"
  sudo install -m 0755 "$TMP_PM/pmtiles" /usr/local/bin/pmtiles
  rm -rf "$TMP_PM"
fi

# ---- 4. Verify ----
c_g "==> Verifying toolchain…"
ok=1
check() { if command -v "$1" >/dev/null 2>&1; then printf '  \033[1;32m✓\033[0m %-12s %s\n' "$1" "$($2 2>&1 | head -1)"; else printf '  \033[1;31m✗ %s MISSING\033[0m\n' "$1"; ok=0; fi; }
check ogr2ogr    "ogr2ogr --version"
check tippecanoe "tippecanoe --version"
check pmtiles    "pmtiles version"
check java       "java -version"
check python3    "python3 --version"
check rclone     "rclone version"
check git        "git --version"
[ "$ok" = 1 ] || { c_r "Some tools are missing — see above."; exit 1; }

# ---- 5. Resource guidance (this is a 4 GB Pi) ----
MEM_KB="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_GB=$(( MEM_KB / 1024 / 1024 ))
c_g "==> Toolchain ready."
c_y ""
c_y "Resource notes for this machine (${MEM_GB} GB RAM):"
if [ "$MEM_GB" -le 5 ]; then
  c_y "  • Low RAM. planetiler (basemap) is set to memory-mapped storage and a"
  c_y "    small heap (PLANETILER_XMX, default 2g). It WILL work but be slow."
  c_y "  • Strongly recommended: add swap on fast storage (SSD, not the SD card):"
  c_y "      sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile \\"
  c_y "        && sudo mkswap /swapfile && sudo swapon /swapfile"
  c_y "  • Prefer an external SSD for the work dir (SD cards are slow + wear out):"
  c_y "      export WORK_DIR=/mnt/ssd/crownland-work OUT_DIR=/mnt/ssd/crownland-out"
fi
c_y "  • Free disk needed: ~40–60 GB for raw sources + intermediates."
c_y ""
c_g "Next:"
c_g "  rclone config                         # add your R2 remote (see r2/README.md)"
c_g "  ./01_fetch_and_filter_crown.sh --inspect   # confirm the ownership filter"
c_g "  export MANIFEST_BASE_URL=https://<your-r2-base>/  R2_BUCKET=<bucket>"
c_g "  ./run_all.sh && ./make_region_packs.sh && ./05_style_manifest.sh"
c_g "  ./r2/upload.sh"
