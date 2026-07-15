import type { StyleSpecification } from "maplibre-gl";
import { archiveUrl } from "../data/storage";
import type { Pack } from "../data/manifest";

// Builds a fully-local MapLibre style for a given pack (spec §6 step 5, §9).
//
// Every source is a `pmtiles://` URL that resolves to a local file — no remote
// tile server, no http(s) basemap. The offline guard (spec §10) asserts this.
//
// Source-layer names must match what the pipeline emits:
//   basemap-*.pmtiles : planetiler "openmaptiles"-style layers (water, land,
//                       transportation, place). We reference a lean subset.
//   crown-*.pmtiles   : single source-layer "crown".
//   tenures-*.pmtiles : single source-layer "tenures".
//   oldgrowth-*.pmtiles : source-layers "oldgrowth" (OGMA legal reserves) and
//                         "oldgrowth_nonlegal" (proposed / non-legal OGMAs).

export const LAYER_IDS = {
  crownFill: "crown-fill",
  crownLine: "crown-outline",
  tenureLine: "tenure-outline",
  oldGrowthFill: "oldgrowth-fill",
  oldGrowthLine: "oldgrowth-outline",
  oldGrowthNlFill: "oldgrowth-nl-fill",
  oldGrowthNlLine: "oldgrowth-nl-outline",
  vriFill: "vri-fill",
  vriLine: "vri-outline",
  bigTrees: "bigtrees-point",
  bigTreeLabels: "bigtrees-label",
  bigTreesBroad: "bigtrees-broad-point",
  bigTreeBroadLabels: "bigtrees-broad-label",
  bigTreesDead: "bigtrees-dead-point",
  bigTreeDeadLabels: "bigtrees-dead-label",
} as const;

// The three BC BigTree registries share the bundled `bigtrees` source but live
// in distinct source-layers, and each renders in its own colour with its own
// toggle. Point size is driven entirely by trunk diameter (DBH); a shared
// min-DBH slider filters all three at once.
export const BIGTREE_MAX_DBH = 6;
const bigTreeDbh = ["to-number", ["get", "dbh_m"], 0];

/** MapLibre filter hiding big trees whose DBH is below the slider value. */
export function bigTreeFilter(minDbh: number): unknown[] {
  return [">=", bigTreeDbh, minDbh];
}

interface BigTreeLayer {
  sourceLayer: string;
  circleId: string;
  labelId: string;
  color: string;
  textColor: string;
}

const BIGTREE_LAYERS: BigTreeLayer[] = [
  {
    sourceLayer: "bigtrees",
    circleId: LAYER_IDS.bigTrees,
    labelId: LAYER_IDS.bigTreeLabels,
    color: "#d0342c", // conifers — red
    textColor: "#8a1f18",
  },
  {
    sourceLayer: "bigtrees_broadleaves",
    circleId: LAYER_IDS.bigTreesBroad,
    labelId: LAYER_IDS.bigTreeBroadLabels,
    color: "#e07b1a", // broadleaves — orange
    textColor: "#9a5410",
  },
  {
    sourceLayer: "bigtrees_dead",
    circleId: LAYER_IDS.bigTreesDead,
    labelId: LAYER_IDS.bigTreeDeadLabels,
    color: "#8a8a8a", // dead — grey
    textColor: "#4a4a4a",
  },
];

// VRI old-growth-by-age defaults. The build pre-filters to age >= VRI_FLOOR_AGE;
// the app's two sliders filter further at runtime (min age + min height).
export const VRI_FLOOR_AGE = 140;
export const VRI_MAX_AGE = 600;
export const VRI_MAX_HEIGHT = 90;

// Real VRI tiles (tiled from the geodatabase) carry age/height as "Mixed" —
// tippecanoe emits some values as strings — while synthetic sample tiles carry
// real Numbers. Coerce so both compare correctly; `to-number` with a 0 fallback
// also turns a missing/null attribute into 0 (which fails the age floor, as it
// should). Without this the filter never matches and the layer renders nothing.
const vriAge = ["to-number", ["get", "age"], 0];
const vriHeight = ["to-number", ["get", "height"], 0];

/** MapLibre filter for the VRI fill from the two slider values. */
export function vriFilter(minAge: number, minHeight: number): unknown[] {
  return ["all", [">=", vriAge, minAge], [">=", vriHeight, minHeight]];
}

// Big trees ship as a bundled, always-on point layer (BC BigTree Registry,
// UBC). The file lives in the app bundle (public/packs), so it is resolved
// locally on every pack regardless of the manifest.
const BIGTREES_FILE = "bigtrees.pmtiles";

export async function buildStyle(pack: Pack): Promise<StyleSpecification> {
  const basemap = pack.archives.basemap;
  const crown = pack.archives.crown;
  const tenures = pack.archives.tenures;
  const oldgrowth = pack.archives.oldgrowth;
  const vri = pack.archives.vri;
  const terrain = pack.archives.terrain;
  const basemapFile = basemap?.file;
  const crownFile = crown?.file;
  const tenuresFile = tenures?.file;
  const oldgrowthFile = oldgrowth?.file;
  const vriFile = vri?.file;

  const sources: StyleSpecification["sources"] = {};

  if (terrain) {
    // Terrarium-encoded elevation tiles; MapLibre computes hillshade on-GPU.
    sources.terrain = {
      type: "raster-dem",
      url: `pmtiles://${await archiveUrl(terrain.file, terrain.bundled)}`,
      encoding: "terrarium",
      tileSize: 256,
    };
  }

  if (basemap) {
    sources.basemap = {
      type: "vector",
      url: `pmtiles://${await archiveUrl(basemap.file, basemap.bundled)}`,
    };
  }
  if (crown) {
    sources.crown = {
      type: "vector",
      url: `pmtiles://${await archiveUrl(crown.file, crown.bundled)}`,
    };
  }
  if (tenures) {
    sources.tenures = {
      type: "vector",
      url: `pmtiles://${await archiveUrl(tenures.file, tenures.bundled)}`,
    };
  }
  if (oldgrowth) {
    sources.oldgrowth = {
      type: "vector",
      url: `pmtiles://${await archiveUrl(oldgrowth.file, oldgrowth.bundled)}`,
    };
  }
  if (vri) {
    sources.vri = {
      type: "vector",
      url: `pmtiles://${await archiveUrl(vri.file, vri.bundled)}`,
    };
  }
  // Big trees: always available (bundled in the app), independent of the pack.
  sources.bigtrees = {
    type: "vector",
    url: `pmtiles://${await archiveUrl(BIGTREES_FILE, true)}`,
  };

  const layers: StyleSpecification["layers"] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f5f1e6" },
    },
  ];

  if (basemapFile) {
    const label = (v: unknown): unknown => ["coalesce", ["get", "name:en"], ["get", "name"], v];
    layers.push(
      // ---- Landcover (forest / grass / wetland / ice) ----
      {
        id: "landcover",
        type: "fill",
        source: "basemap",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "wood", "#d3e3c4",
            "grass", "#e2ecd3",
            "wetland", "#dbe8dc",
            "ice", "#eef3f6",
            "sand", "#efe9d5",
            "#e6ecd8",
          ],
          "fill-opacity": 0.7,
        },
      },
      // ---- Landuse (parks, residential) ----
      {
        id: "landuse",
        type: "fill",
        source: "basemap",
        "source-layer": "landuse",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "residential", "#eae6dc",
            "farmland", "#eef2da",
            "cemetery", "#e0e6d2",
            "hospital", "#f2e3e2",
            "industrial", "#e8e6df",
            "rgba(0,0,0,0)",
          ],
        },
      },
      // ---- Parks / protected areas (green) ----
      {
        id: "park",
        type: "fill",
        source: "basemap",
        "source-layer": "park",
        paint: { "fill-color": "#c7e0b4", "fill-opacity": 0.5 },
      },
      // ---- Hillshade (over land fills, under water/roads/labels) ----
      ...(terrain
        ? ([
            {
              id: "hillshade",
              type: "hillshade",
              source: "terrain",
              paint: {
                "hillshade-exaggeration": 0.45,
                "hillshade-shadow-color": "#6b5d43",
                "hillshade-highlight-color": "#fffaf0",
                "hillshade-accent-color": "#8a7a5a",
                "hillshade-illumination-direction": 315,
              },
            },
          ] as StyleSpecification["layers"])
        : []),
      // ---- Water ----
      {
        id: "water",
        type: "fill",
        source: "basemap",
        "source-layer": "water",
        paint: { "fill-color": "#a7cde3" },
      },
      {
        id: "waterway",
        type: "line",
        source: "basemap",
        "source-layer": "waterway",
        paint: {
          "line-color": "#8fbcd8",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.8],
        },
      },
      // ---- Roads: casing then fill, graded by class ----
      {
        id: "road-casing",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#d8ccb0",
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            7, ["match", ["get", "class"], ["motorway", "trunk"], 2, 0],
            11, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 4, "secondary", 2.5, 1],
            16, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 10, "secondary", 7, 5],
          ],
        },
      },
      {
        id: "road-fill",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match", ["get", "class"],
            ["motorway", "trunk"], "#f6b96a",
            "primary", "#fbd08a",
            ["secondary", "tertiary"], "#ffffff",
            "#ffffff",
          ],
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            7, ["match", ["get", "class"], ["motorway", "trunk"], 1, 0],
            11, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 2.5, "secondary", 1.5, 0.5],
            16, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 7, "secondary", 5, 3],
          ],
        },
      },
      {
        // Trails / paths — dashed, static dasharray (MapLibre disallows a data
        // expression on line-dasharray).
        id: "road-path",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "path"],
        paint: {
          "line-color": "#b79a72",
          "line-dasharray": [2, 1.5],
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.6],
        },
      },
      // ---- Administrative boundaries ----
      {
        id: "boundary",
        type: "line",
        source: "basemap",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        paint: {
          "line-color": "#9a86a6",
          "line-dasharray": [3, 2],
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 1.4],
        },
      },
      // ---- Place labels ----
      {
        id: "place-labels",
        type: "symbol",
        source: "basemap",
        "source-layer": "place",
        layout: {
          "text-field": label("") as never,
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            4, ["match", ["get", "class"], "city", 13, 10],
            12, ["match", ["get", "class"], "city", 18, ["town", "village"], 14, 12],
          ],
        },
        paint: {
          "text-color": "#4a4033",
          "text-halo-color": "#f5f1e6",
          "text-halo-width": 1.4,
        },
      },
      // ---- Water labels ----
      {
        id: "water-labels",
        type: "symbol",
        source: "basemap",
        "source-layer": "water_name",
        layout: {
          "text-field": label("") as never,
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: {
          "text-color": "#3d6b8a",
          "text-halo-color": "#eaf3f9",
          "text-halo-width": 1.2,
        },
      },
    );
  }

  if (vriFile) {
    // VRI "old growth by age" — an age-graduated teal wash under the crown/
    // reserve overlays. The two sliders drive `filter` at runtime; the initial
    // filter shows everything at/above the build floor.
    layers.push(
      {
        id: LAYER_IDS.vriFill,
        type: "fill",
        source: "vri",
        "source-layer": "vri",
        filter: vriFilter(VRI_FLOOR_AGE, 0) as never,
        paint: {
          // Pale teal (young-old) → deep teal (ancient), distinct from crown green.
          "fill-color": [
            "interpolate", ["linear"], vriAge,
            140, "#bfe0d6",
            250, "#5bb3a2",
            400, "#1f7d6e",
            600, "#0d4f45",
          ] as never,
          "fill-opacity": 0.5,
        },
      },
      {
        id: LAYER_IDS.vriLine,
        type: "line",
        source: "vri",
        "source-layer": "vri",
        filter: vriFilter(VRI_FLOOR_AGE, 0) as never,
        paint: {
          "line-color": "#0d4f45",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.2, 13, 0.6],
          "line-opacity": 0.35,
        },
      },
    );
  }

  if (crownFile) {
    layers.push(
      {
        // Crown parcels, semi-transparent green over the basemap (spec §9,
        // matches crownlandmap.ca). Opacity is driven at runtime by the slider.
        id: LAYER_IDS.crownFill,
        type: "fill",
        source: "crown",
        "source-layer": "crown",
        paint: {
          // Saturated green distinct from the light landcover/park greens.
          "fill-color": "#2f8f3f",
          "fill-opacity": 0.45,
        },
      },
      {
        id: LAYER_IDS.crownLine,
        type: "line",
        source: "crown",
        "source-layer": "crown",
        paint: {
          "line-color": "#1f6e2f",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 14, 1.0],
          "line-opacity": 0.7,
        },
      },
    );
  }

  if (oldgrowthFile) {
    layers.push(
      {
        // Proposed / non-legal OGMAs — drawn first (under legal), lighter fill
        // and a dashed outline to read as "proposed".
        id: LAYER_IDS.oldGrowthNlFill,
        type: "fill",
        source: "oldgrowth",
        "source-layer": "oldgrowth_nonlegal",
        paint: {
          "fill-color": "#9b6fc9",
          "fill-opacity": 0.22,
        },
      },
      {
        id: LAYER_IDS.oldGrowthNlLine,
        type: "line",
        source: "oldgrowth",
        "source-layer": "oldgrowth_nonlegal",
        paint: {
          "line-color": "#7a4fb0",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 14, 1.1],
          "line-opacity": 0.75,
          "line-dasharray": [2, 2],
        },
      },
      {
        // Old Growth Management Areas (OGMA legal). Purple, distinct from the
        // crown green, semi-transparent so crown/basemap read underneath.
        id: LAYER_IDS.oldGrowthFill,
        type: "fill",
        source: "oldgrowth",
        "source-layer": "oldgrowth",
        paint: {
          "fill-color": "#7a4fb0",
          "fill-opacity": 0.35,
        },
      },
      {
        id: LAYER_IDS.oldGrowthLine,
        type: "line",
        source: "oldgrowth",
        "source-layer": "oldgrowth",
        paint: {
          "line-color": "#553a80",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 14, 1.2],
          "line-opacity": 0.8,
        },
      },
    );
  }

  if (tenuresFile) {
    layers.push({
      id: LAYER_IDS.tenureLine,
      type: "line",
      source: "tenures",
      "source-layer": "tenures",
      paint: {
        "line-color": "#e0a53a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.8],
        "line-dasharray": [2, 1.5],
      },
    });
  }

  // ---- Big trees (BC BigTree Registry) — bundled point layers, always on top ----
  // One circle + label pair per registry (conifers / broadleaves / dead). The
  // circle radius is driven entirely by trunk diameter (DBH); the shared min-DBH
  // slider filters all three via `filter` at runtime.
  for (const t of BIGTREE_LAYERS) {
    layers.push(
      {
        id: t.circleId,
        type: "circle",
        source: "bigtrees",
        "source-layer": t.sourceLayer,
        filter: bigTreeFilter(0) as never,
        paint: {
          // Radius grows with zoom and with the tree's trunk diameter (DBH).
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            4, ["interpolate", ["linear"], bigTreeDbh, 0.2, 1.5, BIGTREE_MAX_DBH, 4],
            9, ["interpolate", ["linear"], bigTreeDbh, 0.2, 3, BIGTREE_MAX_DBH, 9],
            14, ["interpolate", ["linear"], bigTreeDbh, 0.2, 5, BIGTREE_MAX_DBH, 20],
          ] as never,
          "circle-color": t.color,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      },
      {
        id: t.labelId,
        type: "symbol",
        source: "bigtrees",
        "source-layer": t.sourceLayer,
        minzoom: 11,
        // Label by trunk diameter (DBH) — recorded for nearly every tree. "ø"
        // marks it as a diameter; the tap sheet has full stats. Also honours the
        // shared min-DBH filter.
        filter: ["all", ["has", "dbh_m"], bigTreeFilter(0)] as never,
        layout: {
          "text-field": [
            "concat",
            "ø ",
            ["to-string", ["/", ["round", ["*", ["get", "dbh_m"], 10]], 10]],
            " m",
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": t.textColor,
          "text-halo-color": "#f5f1e6",
          "text-halo-width": 1.4,
        },
      },
    );
  }

  return {
    version: 8,
    // Glyphs must be local too (spec §10 — zero network at runtime). The
    // pipeline copies a font PBF set into /public/fonts. url template uses the
    // app origin, which under Capacitor is the local scheme.
    glyphs: `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`,
    sources,
    layers,
  };
}
