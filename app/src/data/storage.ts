import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

// Storage abstraction for the shipped PMTiles archives.
//
// Archives live in the Capacitor Filesystem **Data** directory on device (spec
// §7). In the browser (dev / milestone-1 desktop render) there is no native
// Filesystem, so we serve the same files statically from Vite's /public dir.
//
// `archiveUrl()` returns a URL suitable for use inside a `pmtiles://` style
// source. The pmtiles lib will issue Range requests against it.

export const DATA_SUBDIR = "packs";

const isNative = Capacitor.isNativePlatform();

/** Filesystem path (relative to the Data directory) for a downloaded archive. */
export function archivePath(fileName: string): string {
  return `${DATA_SUBDIR}/${fileName}`;
}

/**
 * Resolve a browser-loadable URL for an archive.
 * - `bundled` archives ship inside the web bundle (public/packs) and are served
 *   over the app origin on BOTH platforms — on device that is the Capacitor
 *   local scheme, which supports Range requests. This is what the built-in
 *   sample pack uses, and it doubles as the milestone-2 Range-request self-test.
 * - Downloaded archives live in the Filesystem Data directory: on device we
 *   convert the on-disk path to a webview-servable URL; in the browser they fall
 *   back to the same static /packs path.
 */
export async function archiveUrl(fileName: string, bundled = false): Promise<string> {
  if (bundled) {
    return `${import.meta.env.BASE_URL}packs/${fileName}`;
  }
  if (isNative) {
    const { uri } = await Filesystem.getUri({
      directory: Directory.Data,
      path: archivePath(fileName),
    });
    return Capacitor.convertFileSrc(uri);
  }
  // In the browser, sample/dev archives are served from /public/packs.
  return `${import.meta.env.BASE_URL}packs/${fileName}`;
}

/** Whether an archive is present (bundled archives always ship with the app). */
export async function archiveExists(fileName: string, bundled = false): Promise<boolean> {
  if (bundled) return true;
  if (!isNative) {
    try {
      const res = await fetch(await archiveUrl(fileName), { method: "HEAD" });
      // A dev server (Vite) answers unknown paths with an HTML fallback, so a
      // 200 alone is not proof the archive exists — require a non-HTML body.
      const ct = res.headers.get("Content-Type") ?? "";
      return res.ok && !ct.includes("text/html");
    } catch {
      return false;
    }
  }
  try {
    await Filesystem.stat({
      directory: Directory.Data,
      path: archivePath(fileName),
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensurePacksDir(): Promise<void> {
  if (!isNative) return;
  try {
    await Filesystem.mkdir({
      directory: Directory.Data,
      path: DATA_SUBDIR,
      recursive: true,
    });
  } catch {
    // Already exists — ignore.
  }
}

export async function deleteArchive(fileName: string): Promise<void> {
  if (!isNative) return;
  try {
    await Filesystem.deleteFile({
      directory: Directory.Data,
      path: archivePath(fileName),
    });
  } catch {
    // Not present — ignore.
  }
}
