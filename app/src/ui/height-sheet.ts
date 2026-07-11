import { openSheet, button } from "./sheet";
import { heightFromAngles } from "../measure/height";
import {
  startInclinometer,
  ensureMotionPermission,
  hasMotionSensor,
  type Inclinometer,
} from "../measure/inclinometer";
import { startCameraView, type CameraView } from "../measure/camera-view";

// Tree-height tool. Two-angle tangent method (see measure/height.ts): the user
// enters the horizontal distance to the trunk, then sights the top and base to
// capture their elevation angles. Angles come from the device tilt sensor when
// available (Phase 1), with an optional live camera crosshair for precise aiming
// (Phase 2); on a device without motion (e.g. desktop dev) the user types the
// angles instead. The result is handed back as a "1-decimal metres" string.

interface State {
  distance: number;
  top: number | null;
  base: number | null;
}

/** Open the measure tool. `onResult` receives the height as a string (metres). */
export function openHeightSheet(onResult: (heightM: string) => void): void {
  const state: State = { distance: NaN, top: null, base: null };
  let incl: Inclinometer | null = null;
  let live = 0;
  // The element showing the live angle in whichever view is active.
  let liveEl: HTMLElement | null = null;

  const sheet = openSheet("Measure height 📐", () => {
    incl?.stop();
  });

  const hint = document.createElement("p");
  hint.className = "measure-hint";
  hint.textContent = "Stand back about one tree-height on level ground, facing the trunk.";

  // ---- Distance ----
  const distField = document.createElement("label");
  distField.className = "tree-field";
  const distCap = document.createElement("span");
  distCap.textContent = "Distance to trunk (m)";
  const distInput = document.createElement("input");
  distInput.className = "text-input";
  distInput.inputMode = "decimal";
  distInput.placeholder = "e.g. 20";
  distInput.addEventListener("input", () => {
    state.distance = parseFloat(distInput.value);
    recompute();
  });
  distField.append(distCap, distInput);

  // ---- Angles (sensor or manual) ----
  const angleBox = document.createElement("div");
  angleBox.className = "measure-angles";

  // ---- Result ----
  const result = document.createElement("div");
  result.className = "measure-result";

  const useBtn = button("Use height", { primary: true });
  useBtn.style.marginTop = "14px";
  useBtn.style.width = "100%";
  useBtn.disabled = true;
  useBtn.addEventListener("click", () => {
    const h = heightFromAngles(state.distance, state.top!, state.base!);
    onResult(h.toFixed(1));
    sheet.close();
  });

  sheet.body.append(hint, distField, angleBox, result, useBtn);

  function recompute(): void {
    const ready =
      state.distance > 0 && state.top !== null && state.base !== null;
    if (ready) {
      const h = heightFromAngles(state.distance, state.top!, state.base!);
      result.textContent = `Height: ${h.toFixed(1)} m`;
      result.classList.toggle("bad", !(h > 0 && isFinite(h)));
    } else {
      result.textContent = "Height: —";
      result.classList.remove("bad");
    }
    useBtn.disabled = !ready || !(heightFromAngles(state.distance, state.top ?? 0, state.base ?? 0) > 0);
  }

  // A captured-angle chip with a Capture button; `which` sets state + label.
  function angleRow(label: string, which: "top" | "base"): HTMLElement {
    const row = document.createElement("div");
    row.className = "measure-angle-row";
    const cap = document.createElement("span");
    const setLabel = () => {
      const v = state[which];
      cap.textContent = v === null ? `${label}: —` : `${label}: ${v.toFixed(1)}°`;
    };
    setLabel();
    const btn = button("Capture");
    btn.addEventListener("click", () => {
      state[which] = live;
      setLabel();
      recompute();
    });
    row.append(cap, btn);
    return row;
  }

  // Manual entry (no tilt sensor): plain number inputs for the two angles.
  function manualAngles(): void {
    for (const [label, which] of [["Top angle (°)", "top"], ["Base angle (°)", "base"]] as const) {
      const f = document.createElement("label");
      f.className = "tree-field";
      const c = document.createElement("span");
      c.textContent = label;
      const i = document.createElement("input");
      i.className = "text-input";
      i.inputMode = "decimal";
      i.placeholder = which === "base" ? "negative if below eye level" : "";
      i.addEventListener("input", () => {
        const n = parseFloat(i.value);
        state[which] = isNaN(n) ? null : n;
        recompute();
      });
      f.append(c, i);
      angleBox.append(f);
    }
  }

  // Live sensor entry: a big readout plus Top/Base capture rows and a camera
  // button for precise aiming.
  function sensorAngles(): void {
    const readout = document.createElement("div");
    readout.className = "measure-live";
    readout.textContent = "0.0°";
    liveEl = readout;

    const camBtn = button("Aim with camera 📷");
    camBtn.style.width = "100%";
    camBtn.style.marginTop = "6px";
    camBtn.addEventListener("click", () => openCamera());

    angleBox.append(readout, angleRow("Top", "top"), angleRow("Base", "base"), camBtn);
  }

  async function initSensor(): Promise<void> {
    if (!hasMotionSensor() || !(await ensureMotionPermission())) {
      manualAngles();
      return;
    }
    try {
      incl = await startInclinometer((p) => {
        live = p;
        if (liveEl) liveEl.textContent = `${p.toFixed(1)}°`;
      });
      sensorAngles();
    } catch {
      manualAngles();
    }
  }

  // ---- Phase 2: fullscreen camera aiming overlay ----
  function openCamera(): void {
    const overlay = document.createElement("div");
    overlay.className = "cam-overlay";

    const crosshair = document.createElement("div");
    crosshair.className = "cam-crosshair";

    const hud = document.createElement("div");
    hud.className = "cam-live";
    hud.textContent = `${live.toFixed(1)}°`;
    const prevLiveEl = liveEl;
    liveEl = hud; // route live updates to the HUD while the camera is open

    const chips = document.createElement("div");
    chips.className = "cam-chips";
    const setChips = () => {
      const t = state.top === null ? "—" : `${state.top.toFixed(1)}°`;
      const b = state.base === null ? "—" : `${state.base.toFixed(1)}°`;
      chips.textContent = `Top ${t}   Base ${b}`;
    };
    setChips();

    const bar = document.createElement("div");
    bar.className = "cam-bar";
    const capTop = button("Capture top");
    const capBase = button("Capture base");
    const done = button("Done", { primary: true });
    capTop.addEventListener("click", () => {
      state.top = live;
      setChips();
      recompute();
    });
    capBase.addEventListener("click", () => {
      state.base = live;
      setChips();
      recompute();
    });
    bar.append(capTop, capBase, done);

    overlay.append(crosshair, hud, chips, bar);
    document.getElementById("ui-root")!.append(overlay);

    let cam: CameraView | null = null;
    const closeCamera = async () => {
      liveEl = prevLiveEl;
      // Refresh the sheet's own capture labels to reflect camera captures.
      angleBox.replaceChildren();
      sensorAngles();
      await cam?.stop();
      overlay.remove();
    };
    done.addEventListener("click", () => void closeCamera());

    startCameraView(overlay)
      .then((c) => (cam = c))
      .catch(() => {
        // Camera unavailable — drop back to the sheet's tilt-only capture.
        void closeCamera();
      });
  }

  void initSensor();
}
