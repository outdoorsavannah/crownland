// Generates a small SYNTHETIC dataset and tiles it to PMTiles with tippecanoe,
// so the app renders on the desktop (spec milestone 1) without running the full
// GIS pipeline. This is NOT real crown data — it exists only to exercise the
// render + pmtiles-protocol + tap/query paths.
//
// Requires: tippecanoe on PATH (brew install tippecanoe).
// Output:   app/public/packs/{basemap,crown,tenures,oldgrowth}-sample.pmtiles

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, "..");
const OUT = join(APP, "public", "packs");
const TMP = join(APP, "node_modules", ".cache", "sample-geojson");

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// Sample area: Greater Victoria-ish window (matches BUNDLED_MANIFEST sample bbox).
const [W, S, E, N] = [-123.6, 48.3, -123.0, 48.7];

const rand = (a, b) => a + Math.random() * (b - a);

function ring(cx, cy, rx, ry, sides = 6) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx * rand(0.7, 1), cy + Math.sin(t) * ry * rand(0.7, 1)]);
  }
  pts.push(pts[0]);
  return pts;
}

function fc(features) {
  return { type: "FeatureCollection", features };
}

// ---- Crown parcels (discrete green parcels, matching crownlandmap.ca) ----
const OWNER_TYPES = ["Crown Provincial", "Untitled Provincial", "Crown Agency"];
const crown = fc(
  Array.from({ length: 40 }, (_, i) => {
    const cx = rand(W + 0.03, E - 0.03);
    const cy = rand(S + 0.16, N - 0.03);
    return {
      type: "Feature",
      properties: {
        PARCEL_ID: 100000 + i,
        OWNER_TYPE: OWNER_TYPES[i % OWNER_TYPES.length],
        AREA_HA: Math.round(rand(5, 900)),
      },
      geometry: { type: "Polygon", coordinates: [ring(cx, cy, rand(0.01, 0.05), rand(0.01, 0.04))] },
    };
  }),
);

// ---- Tenure polygons (outlined) ----
const TENURE_TYPES = ["Licence of Occupation", "Lease", "Right of Way"];
const PURPOSES = ["Grazing", "Recreation", "Utility", "Commercial"];
const tenures = fc(
  Array.from({ length: 12 }, (_, i) => {
    const cx = rand(W + 0.05, E - 0.05);
    const cy = rand(S + 0.05, N - 0.05);
    return {
      type: "Feature",
      properties: {
        TENURE_TYPE: TENURE_TYPES[i % TENURE_TYPES.length],
        TENURE_PURPOSE: PURPOSES[i % PURPOSES.length],
        TENURE_STAGE: i % 2 ? "Tenure" : "Application",
        TENURE_STATUS: i % 3 ? "Active" : "Disposition in Good Standing",
        CLIENT_NAME: `Sample Client ${i + 1}`,
        AREA_HA: Math.round(rand(2, 300)),
      },
      geometry: { type: "Polygon", coordinates: [ring(cx, cy, rand(0.02, 0.06), rand(0.02, 0.05), 5)] },
    };
  }),
);

// ---- Old Growth Management Areas (OGMA legal reserves, purple fill) ----
const OGMA_TYPES = ["Legal - Order", "Legal - FRPA"];
const OGMA_REASONS = ["Old Growth Representation", "Biodiversity", "Wildlife Habitat"];
const oldgrowth = fc(
  Array.from({ length: 16 }, (_, i) => {
    const cx = rand(W + 0.04, E - 0.04);
    const cy = rand(S + 0.16, N - 0.04);
    return {
      type: "Feature",
      properties: {
        LEGAL_OGMA_PROVID: `OGMA-${9000 + i}`,
        OGMA_TYPE: OGMA_TYPES[i % OGMA_TYPES.length],
        OGMA_PRIMARY_REASON: OGMA_REASONS[i % OGMA_REASONS.length],
        FEATURE_AREA_SQM: Math.round(rand(5, 900)) * 10000,
      },
      geometry: { type: "Polygon", coordinates: [ring(cx, cy, rand(0.015, 0.05), rand(0.015, 0.045), 7)] },
    };
  }),
);

// ---- Proposed (non-legal) OGMAs — fewer, offset from the legal ones ----
const oldgrowthNonlegal = fc(
  Array.from({ length: 9 }, (_, i) => {
    const cx = rand(W + 0.04, E - 0.04);
    const cy = rand(S + 0.16, N - 0.04);
    return {
      type: "Feature",
      properties: {
        NON_LEGAL_OGMA_PROVID: `OGMA-NL-${7000 + i}`,
        OGMA_TYPE: "Non-Legal - Proposed",
        OGMA_PRIMARY_REASON: OGMA_REASONS[i % OGMA_REASONS.length],
        FEATURE_AREA_SQM: Math.round(rand(5, 700)) * 10000,
      },
      geometry: { type: "Polygon", coordinates: [ring(cx, cy, rand(0.015, 0.05), rand(0.015, 0.045), 7)] },
    };
  }),
);

// ---- Basemap: water (sea + a lake), landcover (land), roads ----
const water = fc([
  {
    type: "Feature",
    properties: { class: "ocean" },
    // a strip of sea along the south/west edge
    geometry: { type: "Polygon", coordinates: [[[W, S], [E, S], [E, S + 0.06], [W, S + 0.12], [W, S]]] },
  },
  {
    type: "Feature",
    properties: { class: "lake" },
    geometry: { type: "Polygon", coordinates: [ring(-123.3, 48.55, 0.04, 0.03, 8)] },
  },
]);
const landcover = fc([
  {
    type: "Feature",
    properties: { class: "wood" },
    geometry: { type: "Polygon", coordinates: [[[W, S + 0.12], [E, S + 0.06], [E, N], [W, N], [W, S + 0.12]]] },
  },
]);
const roads = fc([
  {
    type: "Feature",
    properties: { class: "primary" },
    geometry: { type: "LineString", coordinates: [[W + 0.05, N - 0.05], [-123.3, 48.5], [E - 0.05, S + 0.15]] },
  },
  {
    type: "Feature",
    properties: { class: "secondary" },
    geometry: { type: "LineString", coordinates: [[W + 0.1, S + 0.2], [-123.3, 48.5], [E - 0.1, N - 0.1]] },
  },
]);

function writeGeo(name, data) {
  const p = join(TMP, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
}

const crownGeo = writeGeo("crown.geojson", crown);
const tenuresGeo = writeGeo("tenures.geojson", tenures);
const oldgrowthGeo = writeGeo("oldgrowth.geojson", oldgrowth);
const oldgrowthNonlegalGeo = writeGeo("oldgrowth_nonlegal.geojson", oldgrowthNonlegal);
const waterGeo = writeGeo("water.geojson", water);
const landGeo = writeGeo("land.geojson", landcover);
const roadsGeo = writeGeo("roads.geojson", roads);

function tile(args) {
  execFileSync("tippecanoe", args, { stdio: "inherit" });
}

console.log("Tiling crown-sample.pmtiles (crown parcels) …");
tile([
  "-o", join(OUT, "crown-sample.pmtiles"), "-f", "-Z5", "-z14",
  "--drop-densest-as-needed",
  "-l", "crown", crownGeo,
]);

console.log("Tiling tenures-sample.pmtiles …");
tile(["-o", join(OUT, "tenures-sample.pmtiles"), "-f", "-Z5", "-z14", "-l", "tenures", tenuresGeo]);

console.log("Tiling oldgrowth-sample.pmtiles (legal + non-legal layers) …");
tile([
  "-o", join(OUT, "oldgrowth-sample.pmtiles"), "-f", "-Z5", "-z14",
  "-L", `oldgrowth:${oldgrowthGeo}`,
  "-L", `oldgrowth_nonlegal:${oldgrowthNonlegalGeo}`,
]);

console.log("Tiling basemap-sample.pmtiles …");
tile([
  "-o", join(OUT, "basemap-sample.pmtiles"), "-f", "-Z0", "-z14",
  "-L", `water:${waterGeo}`,
  "-L", `landcover:${landGeo}`,
  "-L", `transportation:${roadsGeo}`,
]);

rmSync(TMP, { recursive: true, force: true });
console.log("\nDone. Sample PMTiles written to app/public/packs/");
