import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import {
  BUNDLED_MANIFEST,
  MANIFEST_FILE,
  type Manifest,
  type Pack,
  type ArchiveEntry,
} from "./manifest";
import { archivePath, ensurePacksDir, deleteArchive } from "./storage";

// First-run data download (spec §8): manifest fetch + region packs + resume +
// checksum verification + version tracking.

const isNative = Capacitor.isNativePlatform();
const CHUNK = 4 * 1024 * 1024; // 4 MiB read window for streamed writes

export interface DownloadProgress {
  received: number;
  total: number;
  /** 0..1 */
  ratio: number;
}

export interface InstalledState {
  manifestVersion: string;
  /** archive file -> sha256 that was verified on install */
  archives: Record<string, string>;
}

const STATE_KEY = "installed-state";

export async function loadInstalledState(): Promise<InstalledState> {
  const { value } = await Preferences.get({ key: STATE_KEY });
  if (!value) return { manifestVersion: "", archives: {} };
  try {
    return JSON.parse(value) as InstalledState;
  } catch {
    return { manifestVersion: "", archives: {} };
  }
}

async function saveInstalledState(s: InstalledState): Promise<void> {
  await Preferences.set({ key: STATE_KEY, value: JSON.stringify(s) });
}

/**
 * Fetch the remote manifest from the user-configured host; fall back to the
 * bundled copy when offline or the host is unreachable (spec §8, §10).
 */
export async function loadManifest(hostBaseUrl?: string): Promise<Manifest> {
  const base = hostBaseUrl ?? BUNDLED_MANIFEST.baseUrl;
  try {
    const res = await fetch(new URL(MANIFEST_FILE, base).toString(), {
      cache: "no-store",
    });
    if (res.ok) {
      const m = (await res.json()) as Manifest;
      if (m.schema === 1) return m;
    }
  } catch {
    /* offline or bad host — use bundled */
  }
  return BUNDLED_MANIFEST;
}

/** Resolve an archive's absolute download URL against the manifest base. */
function resolveUrl(manifest: Manifest, entry: ArchiveEntry): string {
  const abs = /^https?:\/\//i.test(entry.url)
    ? entry.url
    : new URL(entry.url, manifest.baseUrl).toString();
  // Cache-bust by content hash so a CDN (e.g. Cloudflare in front of R2) can
  // never serve a stale copy of a file that changed — the checksum-versioned
  // query string is a distinct cache key per data version.
  if (entry.sha256) {
    const u = new URL(abs);
    u.searchParams.set("v", entry.sha256.slice(0, 12));
    return u.toString();
  }
  return abs;
}

async function freeSpaceBytes(): Promise<number | null> {
  // navigator.storage.estimate covers the webview quota; on native this is a
  // best-effort signal, not the true disk free space. Returns null if unknown.
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && typeof est.quota === "number" && typeof est.usage === "number") {
      return est.quota - est.usage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function hasFreeSpaceFor(bytes: number): Promise<boolean | null> {
  const free = await freeSpaceBytes();
  if (free == null) return null; // unknown — let the UI warn but not block
  return free > bytes * 1.1;
}

/** Byte size already downloaded for an archive (for resume). */
async function partialSize(fileName: string): Promise<number> {
  if (!isNative) return 0;
  try {
    const st = await Filesystem.stat({
      directory: Directory.Data,
      path: archivePath(fileName),
    });
    return typeof st.size === "number" ? st.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Download a single archive with HTTP Range resume and streamed writes to the
 * Filesystem Data directory, then verify SHA-256 (spec §8).
 */
export async function downloadArchive(
  manifest: Manifest,
  entry: ArchiveEntry,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  await ensurePacksDir();
  const url = resolveUrl(manifest, entry);
  const already = await partialSize(entry.file);

  // If we already have the whole thing and it verifies, skip.
  if (already === entry.bytes && entry.bytes > 0) {
    if (await verifyArchive(entry)) {
      onProgress({ received: entry.bytes, total: entry.bytes, ratio: 1 });
      return;
    }
    await deleteArchive(entry.file);
  }

  const headers: Record<string, string> = {};
  const resumeFrom = already > 0 && already < entry.bytes ? already : 0;
  // A stale/old copy is present (e.g. an "Update" replacing changed data) but it
  // is not a resumable partial — delete it so we write a clean file. Otherwise a
  // leftover file could survive and fail the checksum.
  if (resumeFrom === 0 && already > 0) await deleteArchive(entry.file);
  if (resumeFrom > 0) headers["Range"] = `bytes=${resumeFrom}-`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Download failed (${res.status}) for ${entry.file}`);
  }
  // If the server ignored our Range request, start over.
  const appending = res.status === 206 && resumeFrom > 0;
  if (!appending && resumeFrom > 0) await deleteArchive(entry.file);

  const total = entry.bytes || Number(res.headers.get("Content-Length")) || 0;
  let received = appending ? resumeFrom : 0;

  // When resuming, the partial file already exists on disk — mark it so the
  // first streamed write appends instead of truncating it.
  if (appending) firstWriteDone.add(entry.file);

  if (!res.body) {
    // No streaming — fall back to a single buffered write.
    const buf = new Uint8Array(await res.arrayBuffer());
    await writeChunk(entry.file, buf, appending);
    received += buf.byteLength;
    onProgress({ received, total, ratio: total ? received / total : 1 });
  } else {
    const reader = res.body.getReader();
    let carry: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry = concat(carry, value);
      received += value.byteLength;
      // Flush in CHUNK-sized pieces to bound base64 memory on device.
      while (carry.byteLength >= CHUNK) {
        await writeChunk(entry.file, carry.subarray(0, CHUNK), true);
        carry = carry.subarray(CHUNK);
      }
      onProgress({ received, total, ratio: total ? received / total : 0 });
    }
    if (carry.byteLength) await writeChunk(entry.file, carry, true);
  }

  if (entry.sha256 && !(await verifyArchive(entry))) {
    await deleteArchive(entry.file);
    throw new Error(`Checksum mismatch for ${entry.file}`);
  }
}

let firstWriteDone = new Set<string>();

async function writeChunk(
  fileName: string,
  data: Uint8Array,
  append: boolean,
): Promise<void> {
  if (!isNative) return; // web dev: archives are served statically, not written
  const b64 = bytesToBase64(data);
  const path = archivePath(fileName);
  const shouldAppend = append && firstWriteDone.has(fileName);
  if (shouldAppend) {
    await Filesystem.appendFile({ directory: Directory.Data, path, data: b64 });
  } else {
    await Filesystem.writeFile({
      directory: Directory.Data,
      path,
      data: b64,
      recursive: true,
    });
    firstWriteDone.add(fileName);
  }
}

/** SHA-256 verify a downloaded archive against the manifest hash. */
export async function verifyArchive(entry: ArchiveEntry): Promise<boolean> {
  if (!entry.sha256) return true; // nothing to verify against (dev)
  if (!isNative) return true;
  try {
    const { data } = await Filesystem.readFile({
      directory: Directory.Data,
      path: archivePath(entry.file),
    });
    const bytes = base64ToBytes(data as string);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bufToHex(digest) === entry.sha256.toLowerCase();
  } catch {
    return false;
  }
}

/** Download all archives of a pack in order, reporting aggregate progress. */
export async function downloadPack(
  manifest: Manifest,
  pack: Pack,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const entries = Object.values(pack.archives).filter(Boolean) as ArchiveEntry[];
  const grandTotal = entries.reduce((n, e) => n + (e.bytes || 0), 0);
  let base = 0;
  firstWriteDone = new Set();

  for (const entry of entries) {
    await downloadArchive(
      manifest,
      entry,
      (p) => {
        const received = base + p.received;
        onProgress({
          received,
          total: grandTotal,
          ratio: grandTotal ? received / grandTotal : p.ratio,
        });
      },
      signal,
    );
    base += entry.bytes || 0;
  }

  const state = await loadInstalledState();
  state.manifestVersion = manifest.version;
  for (const e of entries) state.archives[e.file] = e.sha256;
  await saveInstalledState(state);
}

// ---- byte / base64 helpers ----

function concat(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
