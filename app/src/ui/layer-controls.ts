import { openSheet } from "./sheet";
import type { MapHandle } from "../map/map-init";
import { VRI_FLOOR_AGE, VRI_MAX_AGE, VRI_MAX_HEIGHT } from "../map/style";
import { Preferences } from "@capacitor/preferences";

// Layer toggles (crown / tenures) + crown opacity slider (spec §9). Choices are
// persisted so the map opens the way the user left it.

interface LayerPrefs {
  crown: boolean;
  tenures: boolean;
  oldgrowth: boolean;
  oldgrowthNonLegal: boolean;
  bigtrees: boolean;
  vri: boolean;
  vriMinAge: number;
  vriMinHeight: number;
  opacity: number;
}

const KEY = "layer-prefs";
const DEFAULTS: LayerPrefs = {
  crown: true,
  tenures: true,
  oldgrowth: true,
  oldgrowthNonLegal: true,
  bigtrees: true,
  vri: false, // heavy layer, off by default
  vriMinAge: VRI_FLOOR_AGE,
  vriMinHeight: 0,
  opacity: 0.35,
};

export async function loadLayerPrefs(): Promise<LayerPrefs> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...(JSON.parse(value) as Partial<LayerPrefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function save(prefs: LayerPrefs): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(prefs) });
}

export function applyLayerPrefs(handle: MapHandle, prefs: LayerPrefs): void {
  handle.setCrownVisible(prefs.crown);
  handle.setTenuresVisible(prefs.tenures);
  handle.setOldGrowthVisible(prefs.oldgrowth);
  handle.setOldGrowthNonLegalVisible(prefs.oldgrowthNonLegal);
  handle.setBigTreesVisible(prefs.bigtrees);
  handle.setVriFilter(prefs.vriMinAge, prefs.vriMinHeight);
  handle.setVriVisible(prefs.vri);
  handle.setCrownOpacity(prefs.opacity);
}

/** A labelled range slider whose label shows the live value. */
function sliderRow(
  label: (v: number) => string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
  onCommit: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.style.padding = "10px 0 4px";
  const l = document.createElement("label");
  l.style.display = "block";
  l.style.marginBottom = "6px";
  l.textContent = label(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    l.textContent = label(v);
    onInput(v);
  });
  input.addEventListener("change", onCommit);
  row.append(l, input);
  return row;
}

function toggleRow(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  const l = document.createElement("label");
  l.textContent = label;
  const sw = document.createElement("label");
  sw.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const slider = document.createElement("span");
  slider.className = "slider";
  sw.append(input, slider);
  input.addEventListener("change", () => onChange(input.checked));
  row.append(l, sw);
  return row;
}

export function openLayerControls(handle: MapHandle, prefs: LayerPrefs): void {
  const sheet = openSheet("Layers");

  sheet.body.append(
    toggleRow("Crown land", prefs.crown, (v) => {
      prefs.crown = v;
      handle.setCrownVisible(v);
      void save(prefs);
    }),
    toggleRow("Tenures", prefs.tenures, (v) => {
      prefs.tenures = v;
      handle.setTenuresVisible(v);
      void save(prefs);
    }),
    toggleRow("Old growth — legal (OGMA)", prefs.oldgrowth, (v) => {
      prefs.oldgrowth = v;
      handle.setOldGrowthVisible(v);
      void save(prefs);
    }),
    toggleRow("Old growth — proposed", prefs.oldgrowthNonLegal, (v) => {
      prefs.oldgrowthNonLegal = v;
      handle.setOldGrowthNonLegalVisible(v);
      void save(prefs);
    }),
    toggleRow("Big trees (registry)", prefs.bigtrees, (v) => {
      prefs.bigtrees = v;
      handle.setBigTreesVisible(v);
      void save(prefs);
    }),
    toggleRow("Old growth by age (VRI)", prefs.vri, (v) => {
      prefs.vri = v;
      handle.setVriVisible(v);
      void save(prefs);
    }),
  );

  const opRow = document.createElement("div");
  opRow.style.padding = "12px 0 4px";
  const opLabel = document.createElement("label");
  opLabel.textContent = "Crown opacity";
  opLabel.style.display = "block";
  opLabel.style.marginBottom = "8px";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.05";
  slider.value = String(prefs.opacity);
  slider.addEventListener("input", () => {
    prefs.opacity = Number(slider.value);
    handle.setCrownOpacity(prefs.opacity);
  });
  slider.addEventListener("change", () => void save(prefs));
  opRow.append(opLabel, slider);
  sheet.body.append(opRow);

  // VRI old-growth-by-age filters. These drive the map filter live and only
  // matter when the VRI layer is on.
  const applyVri = () => handle.setVriFilter(prefs.vriMinAge, prefs.vriMinHeight);
  sheet.body.append(
    sliderRow(
      (v) => `VRI — min age: ${v} yr`,
      VRI_FLOOR_AGE, VRI_MAX_AGE, 10, prefs.vriMinAge,
      (v) => { prefs.vriMinAge = v; applyVri(); },
      () => void save(prefs),
    ),
    sliderRow(
      (v) => `VRI — min height: ${v} m`,
      0, VRI_MAX_HEIGHT, 1, prefs.vriMinHeight,
      (v) => { prefs.vriMinHeight = v; applyVri(); },
      () => void save(prefs),
    ),
  );
}
