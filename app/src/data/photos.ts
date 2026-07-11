// Photo attachments for tree pins (option A: real files, not blobs).
//
// Photos are copied into the Capacitor Filesystem Data dir under
// `photos/<pinId>/` and referenced from the pin record by their *relative* path.
// Keeping paths (not base64) out of the pins JSON keeps Preferences small and
// the data export lightweight. On native we pick with @capacitor/camera
// (PHPicker — no full-library permission needed); in the browser (dev) we fall
// back to a plain <input type="file">.

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Camera } from "@capacitor/camera";

const isNative = Capacitor.isNativePlatform();
const DIR = "photos";

function dirFor(pinId: string): string {
  return `${DIR}/${pinId}`;
}

function newName(ext: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

async function ensureDir(pinId: string): Promise<void> {
  try {
    await Filesystem.mkdir({ directory: Directory.Data, path: dirFor(pinId), recursive: true });
  } catch {
    // Already exists — ignore.
  }
}

/** Pick photos from the device roll, copy them into app storage, return the new
 *  relative paths. Returns [] if the user cancels. */
export async function pickAndStorePhotos(pinId: string): Promise<string[]> {
  await ensureDir(pinId);
  return isNative ? pickNative(pinId) : pickWeb(pinId);
}

async function pickNative(pinId: string): Promise<string[]> {
  let result;
  try {
    result = await Camera.pickImages({ quality: 80 });
  } catch {
    return []; // user cancelled
  }
  const out: string[] = [];
  for (const photo of result.photos) {
    const ext = (photo.format || "jpeg").replace("jpg", "jpeg");
    const rel = `${dirFor(pinId)}/${newName(ext)}`;
    await Filesystem.copy({
      from: photo.path ?? photo.webPath,
      to: rel,
      toDirectory: Directory.Data,
    });
    out.push(rel);
  }
  return out;
}

function pickWeb(pinId: string): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      const out: string[] = [];
      for (const file of files) {
        const ext = file.type.includes("png") ? "png" : "jpeg";
        const rel = `${dirFor(pinId)}/${newName(ext)}`;
        const base64 = await fileToBase64(file);
        await Filesystem.writeFile({
          directory: Directory.Data,
          path: rel,
          data: base64,
          recursive: true,
        });
        out.push(rel);
      }
      input.remove();
      resolve(out);
    });
    // If the dialog is dismissed without a selection, `change` never fires;
    // that just leaves the promise pending, which is harmless here.
    document.body.appendChild(input);
    input.click();
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Resolve a stored photo path to a URL usable in an <img src>. */
export async function photoUrl(rel: string): Promise<string> {
  if (isNative) {
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: rel });
    return Capacitor.convertFileSrc(uri);
  }
  const { data } = await Filesystem.readFile({ directory: Directory.Data, path: rel });
  const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${data}`;
}

/** Remove all photos for a pin (best-effort; called when the pin is deleted). */
export async function deletePinPhotos(pinId: string): Promise<void> {
  try {
    await Filesystem.rmdir({ directory: Directory.Data, path: dirFor(pinId), recursive: true });
  } catch {
    // Nothing stored — ignore.
  }
}
