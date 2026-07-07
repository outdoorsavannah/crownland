import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// Thin wrapper over @capacitor/geolocation. Works fully offline (GPS needs no
// network — spec §9 "Locate me", §12 acceptance #3). In the browser it falls
// back to the Web Geolocation API which the Capacitor plugin proxies anyway.

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

export async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted") return true;
    const req = await Geolocation.requestPermissions();
    return req.location === "granted";
  } catch {
    return false;
  }
}

export async function getFix(): Promise<Fix> {
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/** Continuous watch; returns the watch id (string) to clear later. */
export async function watch(cb: (fix: Fix) => void): Promise<string> {
  return Geolocation.watchPosition(
    { enableHighAccuracy: true },
    (pos, err) => {
      if (err || !pos) return;
      cb({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
  );
}

export async function clearWatch(id: string): Promise<void> {
  await Geolocation.clearWatch({ id });
}
