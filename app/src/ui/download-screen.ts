import { Capacitor } from "@capacitor/core";
import type { Manifest, Pack } from "../data/manifest";
import {
  downloadPack,
  hasFreeSpaceFor,
  loadInstalledState,
  type DownloadProgress,
  type InstalledState,
} from "../data/download-manager";
import { archiveExists } from "../data/storage";

// First-run / manage-packs screen (spec §8). Lists packs with sizes + free
// space check, downloads with a progress bar and resume, and hands the chosen
// pack back to the app to open.

const isNative = Capacitor.isNativePlatform();

function fmtBytes(n: number): string {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function packBytes(pack: Pack): number {
  return Object.values(pack.archives).reduce((n, a) => n + (a?.bytes ?? 0), 0);
}

type PackStatus = "download" | "current" | "update";

/**
 * Pack status:
 *  - "download": one or more archives are not present locally
 *  - "update":   all present, but a checksum differs from the manifest (the
 *                hosted data changed since it was installed)
 *  - "current":  all present and checksums match the manifest
 */
async function packStatus(pack: Pack, installed: InstalledState): Promise<PackStatus> {
  const entries = Object.values(pack.archives).filter(Boolean) as {
    file: string;
    sha256?: string;
    bundled?: boolean;
  }[];
  if (!entries.length) return "download";
  let stale = false;
  for (const e of entries) {
    if (!(await archiveExists(e.file, e.bundled))) return "download";
    // Bundled archives ship with the app and are always current. For hosted
    // archives, compare the installed checksum to the manifest's.
    if (!e.bundled && e.sha256 && installed.archives[e.file] !== e.sha256) {
      stale = true;
    }
  }
  return stale ? "update" : "current";
}

export async function showDownloadScreen(
  manifest: Manifest,
  onOpen: (pack: Pack) => void,
): Promise<void> {
  const screen = document.createElement("div");
  screen.className = "screen";

  const h1 = document.createElement("h1");
  h1.textContent = "BC Crown Land";
  const sub = document.createElement("p");
  sub.className = "sub";
  sub.textContent = "Choose an offline data pack to download, then open it.";
  screen.append(h1, sub);

  if (!isNative) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent =
      "Running in a browser (dev). The sample pack renders from /public; region " +
      "packs download only on device.";
    screen.append(note);
  }

  const installed = await loadInstalledState();

  for (const pack of manifest.packs) {
    screen.append(await packCard(manifest, pack, installed, onOpen));
  }

  const disc = document.createElement("p");
  disc.className = "disclaimer";
  disc.textContent =
    "Not authoritative for legal boundaries — for reference only. " +
    manifest.attribution.ogl +
    ". " +
    manifest.attribution.osm +
    ".";
  screen.append(disc);

  document.getElementById("ui-root")!.append(screen);
}

async function packCard(
  manifest: Manifest,
  pack: Pack,
  installed: InstalledState,
  onOpen: (pack: Pack) => void,
): Promise<HTMLElement> {
  const card = document.createElement("div");
  card.className = "pack-card";

  const top = document.createElement("div");
  top.className = "top";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = pack.name;
  const size = document.createElement("div");
  size.className = "size";
  size.textContent = fmtBytes(packBytes(pack));
  top.append(name, size);

  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = pack.description;

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress";
  progressWrap.style.display = "none";
  const bar = document.createElement("div");
  progressWrap.append(bar);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const primary = document.createElement("button");
  primary.className = "btn primary";
  const secondary = document.createElement("button");
  secondary.className = "btn";
  secondary.style.display = "none";

  card.append(top, desc, progressWrap, actions);
  actions.append(primary, secondary);

  const status = await packStatus(pack, installed);
  let controller: AbortController | null = null;

  const startDownload = async () => {
    const bytes = packBytes(pack);
    const enough = await hasFreeSpaceFor(bytes);
    if (enough === false) {
      desc.textContent = `Not enough free space for ${fmtBytes(bytes)}.`;
      return;
    }
    progressWrap.style.display = "block";
    primary.textContent = "Cancel";
    secondary.style.display = "none";
    controller = new AbortController();

    const onProgress = (p: DownloadProgress) => {
      bar.style.width = `${Math.round(p.ratio * 100)}%`;
      size.textContent = `${fmtBytes(p.received)} / ${fmtBytes(p.total)}`;
    };

    try {
      // Only changed/missing archives actually transfer (unchanged ones verify
      // and skip), so an "Update" re-download is cheap.
      await downloadPack(manifest, pack, onProgress, controller.signal);
      progressWrap.style.display = "none";
      size.textContent = fmtBytes(packBytes(pack));
      primary.textContent = "Open";
      primary.onclick = () => onOpen(pack);
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      desc.textContent = aborted
        ? "Paused. Tap Resume to continue."
        : `Failed: ${(err as Error).message}`;
      primary.textContent = aborted ? "Resume" : "Retry";
      progressWrap.style.display = aborted ? "block" : "none";
    } finally {
      controller = null;
    }
  };

  const wireDownloadButton = () => {
    primary.addEventListener("click", () => {
      if (controller) {
        controller.abort();
        primary.textContent = "Resume";
      } else {
        void startDownload();
      }
    });
  };

  if (status === "current") {
    primary.textContent = "Open";
    primary.addEventListener("click", () => onOpen(pack));
  } else if (status === "update") {
    // Data changed on the host: offer Update (re-download) + Open (old copy).
    desc.textContent = "A newer version is available. " + pack.description;
    primary.textContent = "Update";
    secondary.style.display = "block";
    secondary.textContent = "Open";
    secondary.addEventListener("click", () => onOpen(pack));
    wireDownloadButton();
  } else {
    primary.textContent = "Download";
    wireDownloadButton();
  }

  return card;
}
