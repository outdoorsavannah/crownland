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

export const LAYER_IDS = {
  crownFill: "crown-fill",
  crownLine: "crown-outline",
  tenureLine: "tenure-outline",
} as const;

export async function buildStyle(pack: Pack): Promise<StyleSpecification> {
  const basemap = pack.archives.basemap;
  const crown = pack.archives.crown;
  const tenures = pack.archives.tenures;
  const terrain = pack.archives.terrain;
  const basemapFile = basemap?.file;
  const crownFile = crown?.file;
  const tenuresFile = tenures?.file;

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
