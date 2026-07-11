// Export all saved pins + trees as GeoJSON (for mapping tools) and CSV (for
// spreadsheets). On device the two files are written to the Cache dir and handed
// to the native share sheet; in the browser (dev) they download directly.

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { loadPins, TREE_FIELD_LABELS, type SavedPin } from "./saved-pins";

const TREE_KEYS = TREE_FIELD_LABELS.map(([k]) => k);

function geojson(pins: SavedPin[]): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: pins.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          name: p.name,
          kind: p.kind,
          created: new Date(p.createdAt).toISOString(),
          ...(p.tree ?? {}),
          photos: p.photos?.length ?? 0,
        },
      })),
    },
    null,
    2,
  );
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(pins: SavedPin[]): string {
  const headers = ["name", "kind", "lat", "lng", "created", ...TREE_KEYS, "photos"];
  const lines = [headers.join(",")];
  for (const p of pins) {
    const row = [
      p.name,
      p.kind,
      p.lat,
      p.lng,
      new Date(p.createdAt).toISOString(),
      ...TREE_KEYS.map((k) => p.tree?.[k] ?? ""),
      p.photos?.length ?? 0,
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\n");
}

/** Build and deliver the export. Returns the number of pins exported. */
export async function exportPins(): Promise<number> {
  const pins = await loadPins();
  if (!pins.length) return 0;

  const stamp = new Date().toISOString().slice(0, 10);
  const files = [
    { name: `crownland-pins-${stamp}.geojson`, body: geojson(pins), mime: "application/geo+json" },
    { name: `crownland-pins-${stamp}.csv`, body: csv(pins), mime: "text/csv" },
  ];

  if (Capacitor.isNativePlatform()) {
    const uris: string[] = [];
    for (const f of files) {
      await Filesystem.writeFile({
        directory: Directory.Cache,
        path: f.name,
        data: f.body,
        encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: f.name });
      uris.push(uri);
    }
    await Share.share({ title: "Crown Land pins", files: uris });
  } else {
    for (const f of files) {
      const url = URL.createObjectURL(new Blob([f.body], { type: f.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  return pins.length;
}
