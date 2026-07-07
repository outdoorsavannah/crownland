import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

// Register the `pmtiles://` protocol handler with MapLibre exactly once. This is
// what turns `pmtiles://<url>` source URLs in the style into Range-request reads
// against a single-file PMTiles archive — no tile server needed (spec §3, §7).
//
// The same Protocol instance works for:
//   - dev/desktop: http(s) URL to a .pmtiles file (Vite static / object storage)
//   - device:      a capacitor local-file URL produced by Capacitor.convertFileSrc()
// In both cases the underlying fetch must honor HTTP Range requests. On device
// this is the key risk called out in spec §7/§11 and is exercised by milestone 2.

let registered = false;

export function registerPmtilesProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}
