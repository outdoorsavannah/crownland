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
} as const;

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

  // ---- Big trees (BC BigTree Registry) — bundled point layer, always on top ----
  layers.push(
    {
      id: LAYER_IDS.bigTrees,
      type: "circle",
      source: "bigtrees",
      "source-layer": "bigtrees",
      paint: {
        // Radius grows with zoom and with the tree's BC BigTree score.
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, 2.2,
          9, ["interpolate", ["linear"], ["coalesce", ["get", "score"], 150], 100, 3, 450, 6],
          14, ["interpolate", ["linear"], ["coalesce", ["get", "score"], 150], 100, 5, 450, 13],
        ],
        "circle-color": "#b5651d",
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    },
    {
      id: LAYER_IDS.bigTreeLabels,
      type: "symbol",
      source: "bigtrees",
      "source-layer": "bigtrees",
      minzoom: 11,
      // Label by trunk diameter (DBH) — recorded for ~99.6% of trees, far more
      // than height. "ø" marks it as a diameter; the tap sheet has full stats.
      filter: ["has", "dbh_m"],
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
        "text-color": "#6b3f16",
        "text-halo-color": "#f5f1e6",
        "text-halo-width": 1.4,
      },
    },
  );

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
