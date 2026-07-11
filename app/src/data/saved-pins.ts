// Saved pins (spec §9 extension). Persisted locally via Capacitor Preferences so
// they survive app restarts and work fully offline. Rendered as markers on the
// map and listed in the "Saved pins" sheet.
//
// A pin is either a plain location pin (kind "pin") or a tree record (kind
// "tree") carrying the BC BigTree Registry fields plus attached photos.

import { Preferences } from "@capacitor/preferences";
import { deletePinPhotos } from "./photos";

export type PinKind = "pin" | "tree";

/** BC BigTree Registry fields a user can record for a tree pin (all optional). */
export interface TreeFields {
  species?: string;
  nickname?: string;
  score?: string;
  height_m?: string;
  dbh_m?: string;
  crown_m?: string;
  town?: string;
  ownership?: string;
  elevation_m?: string;
  measured?: string;
  id?: string;
}

/** Ordered field keys with friendly labels — drives the tree form + sheet. */
export const TREE_FIELD_LABELS: [keyof TreeFields, string][] = [
  ["species", "Species (common name)"],
  ["nickname", "Nickname"],
  ["score", "BC BigTree score"],
  ["height_m", "Height (m)"],
  ["dbh_m", "Diameter DBH (m)"],
  ["crown_m", "Crown spread (m)"],
  ["town", "Nearest town"],
  ["ownership", "Ownership"],
  ["elevation_m", "Elevation (m)"],
  ["measured", "Last measured"],
  ["id", "Registry ID"],
];

export interface SavedPin {
  id: string;
  kind: PinKind;
  name: string;
  lng: number;
  lat: number;
  createdAt: number;
  /** BigTree fields — present only for kind "tree". */
  tree?: TreeFields;
  /** Relative Filesystem paths (under the Data dir) of attached photos. */
  photos?: string[];
}

const KEY = "saved-pins";

export async function loadPins(): Promise<SavedPin[]> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return [];
  try {
    const arr = JSON.parse(value) as SavedPin[];
    // Back-compat: pins saved before the tree feature have no `kind`.
    return Array.isArray(arr) ? arr.map((p) => ({ ...p, kind: p.kind ?? "pin" })) : [];
  } catch {
    return [];
  }
}

async function persist(pins: SavedPin[]): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(pins) });
}

export function newPinId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// `id` may be supplied up front (tree pins reserve it so photos can be stored
// before the record is persisted); otherwise one is generated.
export async function addPin(
  p: Omit<SavedPin, "id" | "createdAt"> & { id?: string },
): Promise<SavedPin> {
  const pins = await loadPins();
  const pin: SavedPin = { ...p, id: p.id ?? newPinId(), createdAt: Date.now() };
  pins.push(pin);
  await persist(pins);
  return pin;
}

/** Merge a partial update into an existing pin (used by the edit flows). */
export async function updatePin(
  id: string,
  patch: Partial<Omit<SavedPin, "id" | "createdAt">>,
): Promise<void> {
  const pins = await loadPins();
  const i = pins.findIndex((p) => p.id === id);
  if (i === -1) return;
  pins[i] = { ...pins[i], ...patch };
  await persist(pins);
}

export async function removePin(id: string): Promise<void> {
  const pins = await loadPins();
  const gone = pins.find((p) => p.id === id);
  await persist(pins.filter((p) => p.id !== id));
  if (gone?.photos?.length) await deletePinPhotos(gone.id);
}
