// Manifest describing the downloadable data packs (spec §8).
//
// The real manifest is hosted at a user-supplied URL (object storage / self
// host) so packs can be versioned and updated later. At runtime we fetch it,
// fall back to a bundled copy if offline, and let the download manager compare
// versions/checksums.

export interface ArchiveEntry {
  /** Local filename once downloaded, e.g. "crown-vi.pmtiles". */
  file: string;
  /** Absolute or manifest-relative URL to fetch from. */
  url: string;
  /** Uncompressed byte size (for free-space checks + progress). */
  bytes: number;
  /** Lowercase hex SHA-256 for integrity verification. */
  sha256: string;
  /** True if the archive ships in the app bundle (no download needed). */
  bundled?: boolean;
}

export type ArchiveKind = "basemap" | "crown" | "tenures" | "oldgrowth" | "terrain";

export interface Pack {
  id: string;
  name: string;
  description: string;
  /** Bounding box [west, south, east, north] for a fit-to-pack on load. */
  bbox: [number, number, number, number];
  archives: Partial<Record<ArchiveKind, ArchiveEntry>>;
}

export interface Manifest {
  schema: 1;
  /** Manifest version; bump to signal packs changed. */
  version: string;
  /** Base URL that relative archive `url`s resolve against. */
  baseUrl: string;
  packs: Pack[];
  attribution: {
    ogl: string;
    osm: string;
  };
}

export const MANIFEST_FILE = "manifest.json";

/**
 * Public base URL of the Cloudflare R2 bucket (or any static host) that serves
 * the pack archives + manifest.json. Set at build time via
 * `VITE_MANIFEST_BASE_URL` (see app/.env.example). Must end with a slash.
 * The app fetches `${baseUrl}manifest.json`; if that fails (offline / not set),
 * it falls back to BUNDLED_MANIFEST below.
 */
export const MANIFEST_BASE_URL: string =
  import.meta.env.VITE_MANIFEST_BASE_URL || "https://REPLACE-ME.example.com/crownland/";

/**
 * Bundled fallback manifest. Ships with the app so the download screen renders
 * offline. Sizes here are placeholders until the pipeline reports real ones
 * (spec §6 step 6 / §12 acceptance #7). The dev "sample" pack points at the
 * synthetic archives produced by `scripts/gen-sample-data.mjs`.
 */
export const BUNDLED_MANIFEST: Manifest = {
  schema: 1,
  version: "0.0.0-dev",
  baseUrl: MANIFEST_BASE_URL,
  attribution: {
    ogl: "Contains information licensed under the Open Government Licence – British Columbia",
    osm: "© OpenStreetMap contributors (ODbL)",
  },
  packs: [
    {
      id: "sample",
      name: "Built-in sample",
      description:
        "Small synthetic dataset bundled with the app — no download. Renders offline to prove the pipeline. Not real crown data.",
      bbox: [-123.6, 48.3, -123.0, 48.7],
      archives: {
        basemap: sampleArchive("basemap-sample.pmtiles"),
        crown: sampleArchive("crown-sample.pmtiles"),
        tenures: sampleArchive("tenures-sample.pmtiles"),
        oldgrowth: sampleArchive("oldgrowth-sample.pmtiles"),
      },
    },
    region("vancouver-island", "Vancouver Island", [-128.8, 48.3, -123.0, 51.1]),
    region("lower-mainland", "Lower Mainland / Fraser", [-123.6, 48.9, -121.0, 50.2]),
    region("thompson-okanagan", "Thompson-Okanagan", [-121.5, 48.9, -117.5, 52.0]),
    region("kootenay", "Kootenay", [-118.0, 48.9, -114.0, 51.5]),
    region("cariboo", "Cariboo", [-126.0, 51.0, -119.0, 54.0]),
    region("skeena", "Skeena", [-133.5, 52.5, -126.0, 56.5]),
    region("northeast", "Northeast", [-126.0, 54.0, -119.9, 60.0]),
    {
      id: "whole-bc",
      name: "Whole British Columbia",
      description: "Everything. Large download — check free space first.",
      bbox: [-139.1, 48.2, -114.0, 60.0],
      archives: {
        basemap: placeholderArchive("basemap-bc.pmtiles", 0),
        crown: placeholderArchive("crown-bc.pmtiles", 0),
        tenures: placeholderArchive("tenures-bc.pmtiles", 0),
        oldgrowth: placeholderArchive("oldgrowth-bc.pmtiles", 0),
        terrain: placeholderArchive("terrain-bc.pmtiles", 0),
      },
    },
  ],
};

function sampleArchive(file: string): ArchiveEntry {
  // Ships in the app bundle (public/packs) — no download, resolved locally on
  // both web and device. Doubles as the milestone-2 Range-request self-test.
  return { file, url: `packs/${file}`, bytes: 0, sha256: "", bundled: true };
}

function placeholderArchive(file: string, bytes: number): ArchiveEntry {
  return { file, url: file, bytes, sha256: "" };
}

function region(
  id: string,
  name: string,
  bbox: [number, number, number, number],
): Pack {
  return {
    id,
    name,
    description: "Region pack. Basemap + hillshade + crown + tenures + old growth.",
    bbox,
    archives: {
      basemap: placeholderArchive(`basemap-${id}.pmtiles`, 0),
      crown: placeholderArchive(`crown-${id}.pmtiles`, 0),
      tenures: placeholderArchive(`tenures-${id}.pmtiles`, 0),
      oldgrowth: placeholderArchive(`oldgrowth-${id}.pmtiles`, 0),
      terrain: placeholderArchive(`terrain-${id}.pmtiles`, 0),
    },
  };
}
