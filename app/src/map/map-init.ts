import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { registerPmtilesProtocol } from "./pmtiles-protocol";
import { buildStyle, LAYER_IDS, vriFilter } from "./style";
import type { Pack } from "../data/manifest";
import { assertOfflineStyle } from "../data/offline-guard";

export interface MapHandle {
  map: maplibregl.Map;
  setCrownVisible(v: boolean): void;
  setTenuresVisible(v: boolean): void;
  setOldGrowthVisible(v: boolean): void;
  setOldGrowthNonLegalVisible(v: boolean): void;
  setBigTreesVisible(v: boolean): void;
  setVriVisible(v: boolean): void;
  setVriFilter(minAge: number, minHeight: number): void;
  setCrownOpacity(v: number): void;
}

export async function initMap(pack: Pack): Promise<MapHandle> {
  registerPmtilesProtocol();

  const style = await buildStyle(pack);
  // Spec §10: guard that no source points at a remote URL before we hand the
  // style to MapLibre.
  assertOfflineStyle(style);

  const map = new maplibregl.Map({
    container: "map",
    style,
    center: [(pack.bbox[0] + pack.bbox[2]) / 2, (pack.bbox[1] + pack.bbox[3]) / 2],
    zoom: 8,
    maxZoom: 16,
    attributionControl: false,
    // Rotation enabled so the compass control is meaningful (two-finger rotate
    // on touch, right-drag on desktop). Pitch/tilt stays off — this is a flat
    // reference map.
    dragRotate: true,
    pitchWithRotate: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  await new Promise<void>((resolve) => map.on("load", () => resolve()));

  // Fit to the pack's bounds once loaded.
  map.fitBounds(pack.bbox, { padding: 24, animate: false });

  const setVisible = (ids: string[], v: boolean) => {
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
      }
    }
  };

  return {
    map,
    setCrownVisible: (v) => setVisible([LAYER_IDS.crownFill, LAYER_IDS.crownLine], v),
    setTenuresVisible: (v) => setVisible([LAYER_IDS.tenureLine], v),
    setOldGrowthVisible: (v) =>
      setVisible([LAYER_IDS.oldGrowthFill, LAYER_IDS.oldGrowthLine], v),
    setOldGrowthNonLegalVisible: (v) =>
      setVisible([LAYER_IDS.oldGrowthNlFill, LAYER_IDS.oldGrowthNlLine], v),
    setBigTreesVisible: (v) => setVisible([LAYER_IDS.bigTrees, LAYER_IDS.bigTreeLabels], v),
    setVriVisible: (v) => setVisible([LAYER_IDS.vriFill, LAYER_IDS.vriLine], v),
    setVriFilter: (minAge, minHeight) => {
      const f = vriFilter(minAge, minHeight) as never;
      for (const id of [LAYER_IDS.vriFill, LAYER_IDS.vriLine]) {
        if (map.getLayer(id)) map.setFilter(id, f);
      }
    },
    setCrownOpacity: (v) => {
      if (map.getLayer(LAYER_IDS.crownFill)) {
        map.setPaintProperty(LAYER_IDS.crownFill, "fill-opacity", v);
      }
      if (map.getLayer(LAYER_IDS.crownLine)) {
        map.setPaintProperty(LAYER_IDS.crownLine, "line-opacity", Math.min(1, v + 0.2));
      }
    },
  };
}
