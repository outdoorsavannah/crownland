// Saved pins (spec §9 extension). Persisted locally via Capacitor Preferences so
// they survive app restarts and work fully offline. Rendered as markers on the
// map and listed in the "Saved pins" sheet.

import { Preferences } from "@capacitor/preferences";

export interface SavedPin {
  id: string;
  name: string;
  lng: number;
  lat: number;
  createdAt: number;
}

const KEY = "saved-pins";

export async function loadPins(): Promise<SavedPin[]> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return [];
  try {
    const arr = JSON.parse(value) as SavedPin[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function persist(pins: SavedPin[]): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(pins) });
}

export async function addPin(p: Omit<SavedPin, "id" | "createdAt">): Promise<SavedPin> {
  const pins = await loadPins();
  const pin: SavedPin = {
    ...p,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  pins.push(pin);
  await persist(pins);
  return pin;
}

export async function removePin(id: string): Promise<void> {
  const pins = (await loadPins()).filter((p) => p.id !== id);
  await persist(pins);
}
