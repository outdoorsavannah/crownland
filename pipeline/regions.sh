#!/usr/bin/env bash
# Single source of truth for the region ids + bboxes, shared by the region-pack
# scripts. These MUST mirror the region packs in app/src/data/manifest.ts
# (the `region(...)` calls). If you add/adjust a region there, change it here too.
#
# Format per row: "id  west  south  east  north"  (lon/lat, EPSG:4326)
#
# Sourced by build_region.sh and make_region_packs.sh; not executable on its own.

REGIONS=(
  "vancouver-island -128.8 48.3 -123.0 51.1"
  "lower-mainland   -123.6 48.9 -121.0 50.2"
  "thompson-okanagan -121.5 48.9 -117.5 52.0"
  "kootenay         -118.0 48.9 -114.0 51.5"
  "cariboo          -126.0 51.0 -119.0 54.0"
  "skeena           -133.5 52.5 -126.0 56.5"
  "northwest        -139.1 56.0 -126.0 60.0"
  "northeast        -126.0 54.0 -119.9 60.0"
)

# Regions whose layers are NOT clipped from the whole-BC archives — they are
# built directly from their own sources (see build_yukon.sh). Kept OUT of
# REGIONS so make_region_packs.sh / build_region.sh (which clip from whole-BC,
# and whose data stops at 60N) never overwrite them with empty tiles.
EXTRA_REGIONS=(
  "yukon            -141.0 60.0 -123.8 69.7"
)

# region_bbox <id>  ->  prints "west south east north" (space-separated), or
# exits non-zero if the id is unknown. Use with: read -r w s e n < <(region_bbox skeena)
region_bbox() {
  local want="$1" id w s e n
  for row in "${REGIONS[@]}" "${EXTRA_REGIONS[@]}"; do
    read -r id w s e n <<< "$row"
    if [[ "$id" == "$want" ]]; then
      printf '%s %s %s %s\n' "$w" "$s" "$e" "$n"
      return 0
    fi
  done
  return 1
}

# region_ids  ->  prints the known region ids, one per line.
region_ids() {
  local id _rest
  for row in "${REGIONS[@]}"; do
    read -r id _rest <<< "$row"
    printf '%s\n' "$id"
  done
}
