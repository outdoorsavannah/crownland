// Point elevation, sampled offline from the bundled Terrarium DEM tiles.
//
// The pack ships a raster-dem PMTiles archive (see map/style.ts). Rather than
// enable MapLibre's 3D terrain, we read the one pixel under the point straight
// from the archive: pick the tile at the DEM's max zoom, decode the PNG, and
// apply the Terrarium formula   elevation(m) = R*256 + G + B/256 - 32768.

import { PMTiles } from "pmtiles";
import { archiveUrl } from "../data/storage";

export type ElevationSampler = (lng: number, lat: number) => Promise<number | null>;

/** Build a sampler bound to a pack's terrain archive. Returns null if the DEM
 *  can't be opened, so callers can silently fall back to manual entry. */
export async function createElevationSampler(
  file: string,
  bundled: boolean,
): Promise<ElevationSampler | null> {
  let pm: PMTiles;
  let maxZoom: number;
  try {
    pm = new PMTiles(await archiveUrl(file, bundled));
    maxZoom = (await pm.getHeader()).maxZoom;
  } catch {
    return null;
  }

  return async (lng, lat) => {
    try {
      const n = 2 ** maxZoom;
      const xf = ((lng + 180) / 360) * n;
      const latRad = (lat * Math.PI) / 180;
      const yf = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
      const x = Math.floor(xf);
      const y = Math.floor(yf);
      const tile = await pm.getZxy(maxZoom, x, y);
      if (!tile) return null;
      const rgb = await decodePixel(tile.data, xf - x, yf - y);
      if (!rgb) return null;
      return rgb[0] * 256 + rgb[1] + rgb[2] / 256 - 32768;
    } catch {
      return null;
    }
  };
}

/** Decode the RGB at fractional position (fx, fy) within a PNG tile. */
async function decodePixel(
  data: ArrayBuffer,
  fx: number,
  fy: number,
): Promise<[number, number, number] | null> {
  const bmp = await createImageBitmap(new Blob([data]));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  const px = Math.min(bmp.width - 1, Math.floor(fx * bmp.width));
  const py = Math.min(bmp.height - 1, Math.floor(fy * bmp.height));
  const d = ctx.getImageData(px, py, 1, 1).data;
  bmp.close();
  return [d[0], d[1], d[2]];
}
