import { openSheet } from "./sheet";
import type { MapHandle } from "../map/map-init";
import { Preferences } from "@capacitor/preferences";

// Layer toggles (crown / tenures) + crown opacity slider (spec §9). Choices are
// persisted so the map opens the way the user left it.

interface LayerPrefs {
  crown: boolean;
  tenures: boolean;
  opacity: number;
}

const KEY = "layer-prefs";
const DEFAULTS: LayerPrefs = { crown: true, tenures: true, opacity: 0.35 };

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
  handle.setCrownOpacity(prefs.opacity);
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
}
