#!/usr/bin/env bash
# Shared helpers for the pipeline scripts.
set -euo pipefail

log()  { printf '\033[1;32m[pipeline]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[pipeline]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[pipeline]\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1 (see pipeline/README.md)"
}

# Cross-platform SHA-256 -> lowercase hex.
sha256_hex() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Human-readable byte count for a file.
file_bytes() {
  if stat --version >/dev/null 2>&1; then stat -c%s "$1"; else stat -f%z "$1"; fi
}

human_size() {
  local b=$1 u=(B KB MB GB TB) i=0
  while (( b >= 1024 && i < 4 )); do b=$(( b / 1024 )); i=$(( i + 1 )); done
  printf '%d %s' "$b" "${u[$i]}"
}

# Download with resume if not already complete.
fetch() {
  local url="$1" dest="$2"
  if [[ -f "$dest" ]]; then log "Already have $(basename "$dest"), skipping download"; return; fi
  log "Downloading $(basename "$dest") …"
  curl -fL --retry 3 -C - -o "$dest" "$url"
}
