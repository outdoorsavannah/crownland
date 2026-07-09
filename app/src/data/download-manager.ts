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
import { resumeDecision } from "./resume";

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

// Records which archive *version* (by sha256) the current on-disk partial bytes
// belong to, so a resumed download never appends onto bytes from a different
// version (which would splice old+new data and fail the checksum).
const PARTIAL_KEY = "partial-downloads";

async function loadPartials(): Promise<Record<string, string>> {
  const { value } = await Preferences.get({ key: PARTIAL_KEY });
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}

async function setPartial(file: string, sha: string): Promise<void> {
  const p = await loadPartials();
  if (p[file] === sha) return;
  p[file] = sha;
  await Preferences.set({ key: PARTIAL_KEY, value: JSON.stringify(p) });
}

async function clearPartial(file: string): Promise<void> {
  const p = await loadPartials();
  if (!(file in p)) return;
  delete p[file];
  await Preferences.set({ key: PARTIAL_KEY, value: JSON.stringify(p) });
}

const MANIFEST_CACHE_KEY = "manifest-cache";
// Hard ceiling on how long boot will EVER wait for the remote manifest. On a
// marginal / low-data connection an un-aborted fetch can stall for a very long
// time; without this the app blocks on a black screen until the OS gives up.
const MANIFEST_TIMEOUT_MS = 5000;

async function cachedManifest(): Promise<Manifest | null> {
  const { value } = await Preferences.get({ key: MANIFEST_CACHE_KEY });
  if (!value) return null;
  try {
    const m = JSON.parse(value) as Manifest;
    return m.schema === 1 ? m : null;
  } catch {
    return null;
  }
}

/** Fetch the remote manifest with a hard timeout; cache it on success. */
async function fetchRemoteManifest(base: string): Promise<Manifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const res = await fetch(new URL(MANIFEST_FILE, base).toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const m = (await res.json()) as Manifest;
    if (m.schema !== 1) return null;
    await Preferences.set({ key: MANIFEST_CACHE_KEY, value: JSON.stringify(m) });
    return m;
  } catch {
    // Aborted (timeout), offline, or malformed — caller falls back.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the manifest WITHOUT ever blocking boot on the network (spec §8, §10 —
 * this is an offline-first app). Order of preference:
 *   1. A previously-cached remote manifest → returned immediately, with a
 *      background refresh so the next launch is current. This makes a returning
 *      user's boot instant and network-independent.
 *   2. Otherwise (first launch) a fresh remote fetch, bounded by a hard timeout.
 *   3. Otherwise the bundled manifest, so the pack list still renders offline.
 */
export async function loadManifest(hostBaseUrl?: string): Promise<Manifest> {
  const base = hostBaseUrl ?? BUNDLED_MANIFEST.baseUrl;

  const cached = await cachedManifest();
  if (cached) {
    // Serve the cache now; refresh in the background (don't await — a slow or
    // stalled network must never delay boot).
    void fetchRemoteManifest(base);
    return cached;
  }

  // No cache yet (first launch). Wait for the remote, but only up to the
  // timeout, then fall back to the bundled copy.
  return (await fetchRemoteManifest(base)) ?? BUNDLED_MANIFEST;
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

  // If we already have the whole thing and it verifies, skip.
  const already = await partialSize(entry.file);
  if (already === entry.bytes && entry.bytes > 0) {
    if (await verifyArchive(entry)) {
      onProgress({ received: entry.bytes, total: entry.bytes, ratio: 1 });
      await clearPartial(entry.file);
      return;
    }
    await deleteArchive(entry.file);
    await clearPartial(entry.file);
  }

  // Only resume a partial that provably belongs to THIS version (see
  // resumeDecision). A complete old version or a stale partial is deleted so we
  // download a clean file rather than splicing mismatched bytes.
  const onDisk = await partialSize(entry.file);
  const partials = await loadPartials();
  const { resumeFrom, deleteStale } = resumeDecision({
    onDisk,
    entryBytes: entry.bytes,
    entrySha: entry.sha256,
    recordedSha: partials[entry.file],
  });
  if (deleteStale) await deleteArchive(entry.file);
  // Mark the on-disk bytes as belonging to this version so a later interrupted
  // download can resume safely.
  if (entry.sha256) await setPartial(entry.file, entry.sha256);

  const headers: Record<string, string> = {};
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
    await clearPartial(entry.file);
    throw new Error(`Checksum mismatch for ${entry.file}`);
  }
  await clearPartial(entry.file); // complete + verified
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
