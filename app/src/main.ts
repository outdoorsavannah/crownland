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
import { openSearch } from "./ui/search";
import { openSavedPins } from "./ui/pins-panel";
import { ensurePermission, watch, clearWatch } from "./location/geolocation";
import { startHeading } from "./location/heading";
import { fmtDecimal } from "./ui/coords";
import { archiveExists } from "./data/storage";
import { loadPins, addPin, removePin, updatePin, newPinId, type SavedPin } from "./data/saved-pins";
import { openTreeForm, treeName } from "./ui/tree-form";
import { createElevationSampler, type ElevationSampler } from "./measure/elevation";
import { toast } from "./ui/toast";

const LAST_PACK_KEY = "last-pack-id";

/** Forget the current pack and return to the pack list (download screen). */
async function returnToPacks(): Promise<void> {
  await Preferences.remove({ key: LAST_PACK_KEY });
  location.reload();
}

/** Remove the initial boot overlay once real content has rendered. */
function hideBoot(): void {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.add("hidden");
  setTimeout(() => boot.remove(), 300);
}

/** Replace the boot overlay with an error + Retry instead of a black screen. */
function showBootError(message: string): void {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.remove("hidden");
  boot.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "boot-inner";
  const title = document.createElement("div");
  title.className = "boot-title";
  title.textContent = "Couldn’t start the map";
  const sub = document.createElement("div");
  sub.className = "boot-sub boot-error";
  sub.textContent = message;
  const retry = document.createElement("button");
  retry.className = "btn primary";
  retry.style.marginTop = "16px";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => location.reload());
  inner.append(title, sub, retry);
  boot.append(inner);
}

async function main(): Promise<void> {
  // loadManifest is cache-first + timeout-bounded, so this never blocks boot on
  // the network (offline-first, spec §10).
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
      hideBoot();
      toast(`"${pack.name}" isn't downloaded yet.`);
      return;
    }
    void Preferences.set({ key: LAST_PACK_KEY, value: pack.id });
    document.getElementById("ui-root")!.innerHTML = "";
    await bootMap(manifest, pack);
  };

  if (lastPack) {
    await open(lastPack);
  } else {
    await showDownloadScreen(manifest, open);
    hideBoot();
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

  const terrain = pack.archives.terrain;
  if (terrain) elevationSampler = await createElevationSampler(terrain.file, !!terrain.bundled);

  const prefs = await loadLayerPrefs();
  applyLayerPrefs(handle, prefs);

  wireInteractions(handle, manifest);
  wireControls(handle, manifest, prefs);
  void refreshSavedPins(handle.map);
  hideBoot(); // map is loaded and interactive — safe to reveal it

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

  // Compass: needle points to true north; tap resets bearing to north.
  const compassBtn = document.getElementById("btn-compass")!;
  const needle = compassBtn.querySelector(".compass-needle") as HTMLElement;
  const syncCompass = () => {
    needle.style.transform = `rotate(${-handle.map.getBearing()}deg)`;
  };
  handle.map.on("rotate", syncCompass);
  syncCompass();
  compassBtn.addEventListener("click", () => handle.map.easeTo({ bearing: 0, pitch: 0 }));

  // Search: parse a coordinate string, fly there, drop a (saveable) pin.
  document.getElementById("btn-search")!.addEventListener("click", () => {
    openSearch(handle.map, (lngLat) => {
      handle.map.flyTo({
        center: [lngLat.lng, lngLat.lat],
        zoom: Math.max(handle.map.getZoom(), 12),
      });
      dropPinAndOpen(handle.map, lngLat);
    });
  });

  // Saved pins list: fly to a pin, or delete it.
  document.getElementById("btn-pins")!.addEventListener("click", () => {
    void openSavedPins(
      (pin) =>
        handle.map.flyTo({
          center: [pin.lng, pin.lat],
          zoom: Math.max(handle.map.getZoom(), 13),
        }),
      async (pin) => {
        await removePin(pin.id);
        await refreshSavedPins(handle.map);
      },
    );
  });

  wireLocate(handle);
}

// ---- Live location + heading beam (Google-Maps-style "you are here") ----

/** Marker element: a location dot plus a compass-heading cone (hidden until a
 *  heading is available). Returns the dot element and the beam path to toggle. */
function makeLocationEl(): { el: HTMLElement; beam: HTMLElement } {
  const el = document.createElement("div");
  el.className = "gps-marker";
  const uid = "gpsbeam-" + Math.random().toString(36).slice(2, 7);
  el.innerHTML =
    `<svg width="72" height="72" viewBox="-36 -36 72 72" style="overflow:visible;display:block">` +
    `<defs><radialGradient id="${uid}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="38">` +
    `<stop offset="0" stop-color="#2f6fed" stop-opacity="0.7"/>` +
    `<stop offset="0.5" stop-color="#2f6fed" stop-opacity="0.35"/>` +
    `<stop offset="1" stop-color="#2f6fed" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    // Cone points "up" (= geographic north at rotation 0, since the marker uses
    // map-aligned rotation); setRotation(heading) turns it to the compass bearing.
    `<path class="gps-beam" d="M0 0 L -22 -32 A 39 39 0 0 1 22 -32 Z" fill="url(#${uid})" style="display:none"/>` +
    `<circle r="8" fill="#2f6fed" stroke="#ffffff" stroke-width="3"/>` +
    `</svg>`;
  return { el, beam: el.querySelector(".gps-beam") as unknown as HTMLElement };
}

function wireLocate(handle: MapHandle): void {
  const locateBtn = document.getElementById("btn-locate")!;
  let marker: maplibregl.Marker | null = null;
  let beam: HTMLElement | null = null;
  let watchId: string | null = null;
  let stopHeading: (() => void) | null = null;
  let tracking = false;
  let firstFix = true;

  const stop = () => {
    tracking = false;
    if (watchId) {
      void clearWatch(watchId);
      watchId = null;
    }
    stopHeading?.();
    stopHeading = null;
    marker?.remove();
    marker = null;
    beam = null;
    locateBtn.classList.remove("active");
  };

  locateBtn.addEventListener("click", async () => {
    if (tracking) {
      stop(); // toggle off
      return;
    }
    tracking = true;
    locateBtn.classList.add("active");

    if (!(await ensurePermission())) {
      stop();
      toast("Location permission denied.");
      return;
    }

    const made = makeLocationEl();
    beam = made.beam;
    marker = new maplibregl.Marker({
      element: made.el,
      anchor: "center",
      rotationAlignment: "map", // keep the beam pointing at a true bearing
    });

    firstFix = true;
    let id: string;
    try {
      id = await watch((fix) => {
        if (!tracking || !marker) return;
        marker.setLngLat([fix.lng, fix.lat]).addTo(handle.map);
        if (firstFix) {
          firstFix = false;
          handle.map.easeTo({
            center: [fix.lng, fix.lat],
            zoom: Math.max(handle.map.getZoom(), 15),
          });
        }
      });
    } catch {
      stop();
      toast("Couldn’t get your location.");
      return;
    }
    if (!tracking) {
      // Toggled off while the watch was starting.
      void clearWatch(id);
      return;
    }
    watchId = id;

    // Heading is best-effort: the dot still tracks without it.
    stopHeading = await startHeading((deg) => {
      marker?.setRotation(deg);
      if (beam) beam.style.display = "block";
    });
    if (!tracking && stopHeading) {
      stopHeading();
      stopHeading = null;
    }
  });
}

function wireInteractions(handle: MapHandle, _manifest: Manifest): void {
  const { map } = handle;
  const queryLayers = [
    LAYER_IDS.bigTrees,
    LAYER_IDS.tenureLine,
    LAYER_IDS.oldGrowthFill,
    LAYER_IDS.oldGrowthNlFill,
    LAYER_IDS.crownFill,
    LAYER_IDS.vriFill,
  ].filter((id) => map.getLayer(id));

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
    // Prefer the most specific feature: a big-tree point, then tenure, then
    // old-growth reserve, then the crown parcel underneath.
    const preferred =
      feats.find((f) => f.source === "bigtrees") ??
      feats.find((f) => f.source === "tenures") ??
      feats.find((f) => f.source === "oldgrowth") ??
      feats.find((f) => f.source === "crown") ??
      feats[0];
    showFeatureSheet(preferred, e.lngLat, () => {
      tapMarker?.remove();
      tapMarker = null;
    });
  });

  map.on("mouseenter", queryLayers[0] ?? "", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", queryLayers[0] ?? "", () => (map.getCanvas().style.cursor = ""));

  // Long-press → dropped pin; the sheet offers "Save pin" (spec §9, acceptance
  // #4, plus saved-pins extension).
  wireLongPress(map, (lngLat) => dropPinAndOpen(map, lngLat));

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

// ---- Dropped pins + saved pins ----
let pinMarker: maplibregl.Marker | null = null; // transient (unsaved) pin
let savedMarkers: maplibregl.Marker[] = [];
let elevationSampler: ElevationSampler | null = null; // reads the pack's DEM

function makePinEl(color: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);" +
    `background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer`;
  return el;
}

/** Tree marker: a 🌲 emoji so tree pins read differently from plain pins. */
function makeTreeEl(): HTMLElement {
  const el = document.createElement("div");
  el.className = "tree-marker";
  el.textContent = "🌲";
  return el;
}

/** Drop a transient (amber) pin and open its sheet: "Save pin" or "Save tree". */
function dropPinAndOpen(map: maplibregl.Map, lngLat: { lng: number; lat: number }): void {
  pinMarker?.remove();
  pinMarker = new maplibregl.Marker({ element: makePinEl("#e0a53a"), anchor: "bottom" })
    .setLngLat(lngLat)
    .addTo(map);
  showPinSheet(lngLat, {
    onSave: async (name) => {
      await addPin({
        kind: "pin",
        name: name || `Pin ${fmtDecimal(lngLat.lat, lngLat.lng)}`,
        lng: lngLat.lng,
        lat: lngLat.lat,
      });
      pinMarker?.remove(); // it becomes a persistent saved marker instead
      pinMarker = null;
      await refreshSavedPins(map);
      toast("Pin saved");
    },
    onSaveTree: (pinName) => {
      const id = newPinId();
      openTreeForm(lngLat, {
        pinId: id,
        initialNickname: pinName,
        getElevation: elevationSampler ?? undefined,
        onSubmit: async (tree, photos, name) => {
          await addPin({ id, kind: "tree", name, lng: lngLat.lng, lat: lngLat.lat, tree, photos });
          pinMarker?.remove();
          pinMarker = null;
          await refreshSavedPins(map);
          toast("Tree saved 🌲");
        },
      });
    },
  });
}

/** Re-render all saved pins/trees as persistent markers. */
async function refreshSavedPins(map: maplibregl.Map): Promise<void> {
  for (const m of savedMarkers) m.remove();
  savedMarkers = [];
  for (const pin of await loadPins()) {
    const el = pin.kind === "tree" ? makeTreeEl() : makePinEl("#2f9e57");
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([pin.lng, pin.lat])
      .addTo(map);
    marker.getElement().addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (pin.kind === "tree") {
        openSavedTree(map, pin);
      } else {
        showPinSheet(
          { lng: pin.lng, lat: pin.lat },
          {
            saved: { id: pin.id, name: pin.name },
            onRename: async (name) => {
              await updatePin(pin.id, { name });
              await refreshSavedPins(map);
              toast("Pin renamed");
            },
            onDelete: async () => {
              await removePin(pin.id);
              await refreshSavedPins(map);
              toast("Pin deleted");
            },
          },
        );
      }
    });
    savedMarkers.push(marker);
  }
}

/** Open a saved tree in the tree form for editing (fields + photos) or delete. */
function openSavedTree(map: maplibregl.Map, pin: SavedPin): void {
  openTreeForm(
    { lng: pin.lng, lat: pin.lat },
    {
      pinId: pin.id,
      initial: pin,
      getElevation: elevationSampler ?? undefined,
      onSubmit: async (tree, photos, name) => {
        await updatePin(pin.id, { tree, photos, name: name || treeName(tree) });
        await refreshSavedPins(map);
        toast("Tree updated 🌲");
      },
      onDelete: async () => {
        await removePin(pin.id);
        await refreshSavedPins(map);
        toast("Tree deleted");
      },
    },
  );
}

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

  // Never drop a pin while a sheet is open (belt-and-braces: the backdrop already
  // blocks the map, but this stops any stray long-press launching a pin menu
  // underneath an open sheet).
  const fire = (lngLat: { lng: number; lat: number }) => {
    if (document.querySelector("#ui-root .sheet")) return;
    cb(lngLat);
  };

  map.on("touchstart", (e) => {
    if (e.originalEvent.touches.length !== 1) return cancel();
    start = e.point;
    timer = setTimeout(() => fire(e.lngLat), HOLD_MS);
  });
  map.on("touchmove", (e) => {
    if (start && e.point.dist(start) > MOVE_TOL) cancel();
  });
  map.on("touchend", cancel);

  // Desktop parity for dev testing.
  map.on("mousedown", (e) => {
    if (e.originalEvent.button !== 0) return;
    start = e.point;
    timer = setTimeout(() => fire(e.lngLat), HOLD_MS);
  });
  map.on("mousemove", (e) => {
    if (start && e.point.dist(start) > MOVE_TOL) cancel();
  });
  map.on("mouseup", cancel);
}

// Safety net: if any boot step throws (or an async rejection escapes), show the
// error overlay instead of leaving the user on a black screen.
main().catch((err) => showBootError(err instanceof Error ? err.message : String(err)));
window.addEventListener("unhandledrejection", (e) => {
  if (document.getElementById("boot")) {
    const r = e.reason as { message?: string } | undefined;
    showBootError(r?.message ?? String(e.reason ?? "Unexpected error"));
  }
});
