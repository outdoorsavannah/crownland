# Big-tree registries: dead + broadleaves, DBH-driven points

Date: 2026-07-15

## Context
The app shipped one bundled BC BigTree Registry layer (conifers). We added the
registry's broadleaves and dead exports, and reworked how tree points are sized
and filtered.

## Decisions

- **One bundled `bigtrees.pmtiles`, three source-layers** (`bigtrees`,
  `bigtrees_broadleaves`, `bigtrees_dead`) — same shape as the two-layer
  `oldgrowth-*.pmtiles`. Keeps a single always-on bundled source and one style
  source; no manifest / region-pack / checksum machinery, matching the original
  conifers layer.

- **`xlsx_to_geojson.py` takes header aliases.** The conifer/broadleaf exports
  share column names; the dead export differs (`Tree`/`Name`/`dia_m`/… vs
  `common_name`/`tree_nickname`/`DBH_(m)`). Each output key maps to a list of
  accepted headers, first match wins, so one script handles all three. `num()`
  now parses a leading number so unit-marked cells (e.g. broadleaf score `398"`)
  survive.

- **Point radius is driven entirely by DBH**, not the BC BigTree score
  (previous behaviour). DBH spans ~0.15–6 m across the three sets, so the radius
  interpolates over `dbh_m` 0.2 → `BIGTREE_MAX_DBH` (6) nested inside a zoom
  interpolation.

- **One shared min-DBH slider** filters all three layers at once (user choice),
  rather than a slider per registry. Three independent toggles + three colours
  (conifers red `#d0342c`, broadleaves orange `#e07b1a`, dead grey `#8a8a8a`)
  still distinguish them.

- **Tap ergonomics:** the map tap hit-tests a 12 px pixel box (not the exact
  pixel) and, among big-tree hits, picks the nearest to the tap. Saved pin/tree
  DOM markers get a transparent `.hit-pad` (~14 px) that enlarges the tap target
  without moving the marker.

- **Pin-on-GPS snap:** while live location tracking is on, a long-press within
  24 px of the GPS dot drops the pin exactly on the fix. Only long-press snaps
  (search-to-coordinate keeps the typed point); the last fix is cleared when
  tracking stops so a stale position never snaps.
