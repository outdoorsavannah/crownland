// Inclinometer — device pitch (elevation angle) from the accelerometer.
//
// We read `accelerationIncludingGravity` via @capacitor/motion (a thin wrapper
// over the web DeviceMotion API, which works inside the WKWebView too). With the
// device held in portrait and sighted along its top edge, gravity's component
// along the device Y axis gives the elevation of that sight line above
// horizontal: pitch = asin(ay / |g|). Flat (screen up) reads 0°; tilting the top
// edge up toward the zenith reads +90°; sighting below horizontal reads
// negative. See height.ts for how the angle becomes a height.

import { Motion } from "@capacitor/motion";
import type { PluginListenerHandle } from "@capacitor/core";

const RAD_TO_DEG = 180 / Math.PI;
// Low-pass factor: smaller = smoother but laggier. Tuned for a steady readout.
const SMOOTHING = 0.15;

export interface Inclinometer {
  /** Latest smoothed pitch in degrees (read on capture). */
  readonly pitch: number;
  stop(): void;
}

/** True when live tilt sensing is available (native, or a browser that emits
 *  DeviceMotion). When false the UI should fall back to manual angle entry. */
export function hasMotionSensor(): boolean {
  return typeof DeviceMotionEvent !== "undefined";
}

/** iOS 13+ gates DeviceMotion behind a permission prompt that must be triggered
 *  from a user gesture. No-op elsewhere. Returns false if the user declines. */
export async function ensureMotionPermission(): Promise<boolean> {
  const req = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
    ?.requestPermission;
  if (typeof req !== "function") return true;
  try {
    return (await req()) === "granted";
  } catch {
    return false;
  }
}

/** Start streaming pitch. `onChange` fires on every smoothed update (for the
 *  live readout); read `.pitch` at capture time. Call `.stop()` when done. */
export async function startInclinometer(onChange: (pitch: number) => void): Promise<Inclinometer> {
  let pitch = 0;
  let seeded = false;
  let handle: PluginListenerHandle | undefined;

  handle = await Motion.addListener("accel", (event) => {
    const g = event.accelerationIncludingGravity;
    const mag = Math.hypot(g.x, g.y, g.z);
    if (mag < 1e-6) return;
    const raw = Math.asin(Math.max(-1, Math.min(1, g.y / mag))) * RAD_TO_DEG;
    pitch = seeded ? pitch + SMOOTHING * (raw - pitch) : raw;
    seeded = true;
    onChange(pitch);
  });

  return {
    get pitch() {
      return pitch;
    },
    stop() {
      handle?.remove();
      handle = undefined;
    },
  };
}
