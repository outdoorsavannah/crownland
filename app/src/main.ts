import maplibregl from "maplibre-gl";
import { Preferences } from "@capacitor/preferences";
import { loadManifest } from "./data/download-manager";
import { showDownloadScreen } from "./ui/download-screen";
import { initMap, type MapHandle } from "./map/map-init";
import { LAYER_IDS } from "./map/style";
import type { Manifest, Pack } from "./data/manifest";
import { showFeatureSheet, showPinSheet } from "./ui/feature-sheet";
import { openLayerControls, loadLayerPrefs, applyLayerPrefs } from "./ui/layer-controls";
import { openInfoPanel } from "./ui/info-panel";
import { ensurePermission, getFix } from "./location/geolocation";
import { fmtDecimal } from "./ui/coords";
import { archiveExists } from "./data/storage";
import { toast } from "./ui/toast";

const LAST_PACK_KEY = "last-pack-id";

/** Forget the current pack and return to the pack list (download screen). */
async function returnToPacks(): Promise<void> {
  await Preferences.remove({ key: LAST_PACK_KEY });
  location.reload();
}

async function main(): Promise<void> {
  const manifest = await loadManifest();

  // Reopen the last-used pack directly if it is still installed; otherwise the
  // first-run download screen (spec §8).
  const { value: lastPackId } = await Preferences.get({ key: LAST_PACK_KEY });
  const lastPack = manifest.packs.find((p) => p.id === lastPackId);

  const open = async (pack: Pack) => {
    // Guard: never boot the map for a pack whose archives aren't present yet
    // (e.g. a region pack that hasn't been downloaded). Otherwise the pmtiles
    // reads hit missing files and surface a raw WKWebView error.
    if (!(await packPresent(pack))) {
      await Preferences.remove({ key: LAST_PACK_KEY });
      document.getElementById("ui-root")!.innerHTML = "";
      await showDownloadScreen(manifest, open);
      toast(`"${pack.name}" isn't downloaded yet.`);
      return;
    }
    void Preferences.set({ key: LAST_PACK_KEY, value: pack.id });
    document.getElementById("ui-root")!.innerHTML = "";
    void bootMap(manifest, pack);
  };

  if (lastPack) {
    await open(lastPack);
  } else {
    await showDownloadScreen(manifest, open);
  }
}

/** True only if every archive of the pack is present (bundled or downloaded). */
async function packPresent(pack: Pack): Promise<boolean> {
  const entries = Object.values(pack.archives).filter(Boolean) as {
    file: string;
    bundled?: boolean;
  }[];
  if (!entries.length) return false;
  const present = await Promise.all(entries.map((e) => archiveExists(e.file, e.bundled)));
  return present.every(Boolean);
}

async function bootMap(manifest: Manifest, pack: Pack): Promise<void> {
  const handle = await initMap(pack);

  const prefs = await loadLayerPrefs();
  applyLayerPrefs(handle, prefs);

  wireInteractions(handle, manifest);
  wireControls(handle, manifest, prefs);

  if (import.meta.env.DEV) {
    (window as unknown as { __mapHandle?: MapHandle }).__mapHandle = handle;
  }
}

function wireControls(
  handle: MapHandle,
  manifest: Manifest,
  prefs: Awaited<ReturnType<typeof loadLayerPrefs>>,
): void {
  document.getElementById("btn-layers")!.addEventListener("click", () => {
    openLayerControls(handle, prefs);
  });
  document.getElementById("btn-info")!.addEventListener("click", () => {
    openInfoPanel(manifest, returnToPacks);
  });

  let locateMarker: maplibregl.Marker | null = null;
  const locateBtn = document.getElementById("btn-locate")!;
  locateBtn.addEventListener("click", async () => {
    locateBtn.classList.add("active");
    try {
      if (!(await ensurePermission())) {
        locateBtn.classList.remove("active");
        return;
      }
      const fix = await getFix();
      handle.map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(handle.map.getZoom(), 13) });
      if (!locateMarker) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;border-radius:50%;background:#2f9e57;border:2px solid #fff;box-shadow:0 0 0 4px rgba(47,158,87,.3)";
        locateMarker = new maplibregl.Marker({ element: el });
      }
      locateMarker.setLngLat([fix.lng, fix.lat]).addTo(handle.map);
    } catch {
      /* permission denied or timeout — ignore */
    } finally {
      locateBtn.classList.remove("active");
    }
  });
}

function wireInteractions(handle: MapHandle, _manifest: Manifest): void {
  const { map } = handle;
  const queryLayers = [LAYER_IDS.tenureLine, LAYER_IDS.crownFill].filter((id) =>
    map.getLayer(id),
  );

  // Tap → drop a marker at the tap point + feature attributes + coordinates
  // (spec §9, acceptance #2). Prefer a tenure feature over the crown parcel
  // underneath it. The marker is cleared when the sheet closes.
  let tapMarker: maplibregl.Marker | null = null;
  map.on("click", (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: queryLayers });
    if (!feats.length) return;
    tapMarker?.remove();
    const el = document.createElement("div");
    el.style.cssText =
      "width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);" +
      "background:#2f8f3f;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)";
    tapMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(e.lngLat)
      .addTo(map);
    const tenure = feats.find((f) => f.source === "tenures");
    showFeatureSheet(tenure ?? feats[0], e.lngLat, () => {
      tapMarker?.remove();
      tapMarker = null;
    });
  });

  map.on("mouseenter", queryLayers[0] ?? "", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", queryLayers[0] ?? "", () => (map.getCanvas().style.cursor = ""));

  // Long-press → dropped pin with decimal + DMS (spec §9, acceptance #4).
  wireLongPress(map, (lngLat) => {
    if (pinMarker) pinMarker.remove();
    const el = document.createElement("div");
    el.style.cssText =
      "width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#e0a53a;border:2px solid #fff";
    pinMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(lngLat)
      .addTo(map);
    showPinSheet(lngLat);
  });

  // Live coordinate readout (spec §9).
  const readout = document.getElementById("coord-readout")!;
  const updateReadout = (lngLat: { lng: number; lat: number }) => {
    readout.hidden = false;
    readout.textContent = fmtDecimal(lngLat.lat, lngLat.lng, 5);
  };
  map.on("mousemove", (e) => updateReadout(e.lngLat));
  map.on("moveend", () => updateReadout(map.getCenter()));
  updateReadout(map.getCenter());
}

let pinMarker: maplibregl.Marker | null = null;

/** Long-press (touch) / long mouse-down that doesn't turn into a drag. */
function wireLongPress(
  map: maplibregl.Map,
  cb: (lngLat: { lng: number; lat: number }) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: maplibregl.Point | null = null;
  const HOLD_MS = 500;
  const MOVE_TOL = 8;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };

  map.on("touchstart", (e) => {
    if (e.originalEvent.touches.length !== 1) return cancel();
    start = e.point;
    timer = setTimeout(() => cb(e.lngLat), HOLD_MS);
  });
  map.on("touchmove", (e) => {
    if (start && e.point.dist(start) > MOVE_TOL) cancel();
  });
  map.on("touchend", cancel);

  // Desktop parity for dev testing.
  map.on("mousedown", (e) => {
    if (e.originalEvent.button !== 0) return;
    start = e.point;
    timer = setTimeout(() => cb(e.lngLat), HOLD_MS);
  });
  map.on("mousemove", (e) => {
    if (start && e.point.dist(start) > MOVE_TOL) cancel();
  });
  map.on("mouseup", cancel);
}

void main();
