# BC Big Trees & Old Growth — Offline Map (Capacitor, iOS + Android)

An **offline-first** mobile map for finding and recording British Columbia's
**big trees and old-growth forest** in the field. It overlays the BC BigTree
Registry, legal and proposed old-growth reserves (OGMAs), and old-growth-by-age
from VRI on an open-source basemap — with crown-land parcels and forest tenures
for land-status context.

After a one-time data download it works with **no network** (airplane mode):
browse the layers, drop and record tree pins (species, measurements, photos),
**measure tree height with the phone's tilt sensor**, and export your finds. Built
from public BC open-data sources; **not** authoritative for legal boundaries.

> Heritage note: this began as a personal-use offline crown-land parcel viewer
> (à la crownlandmap.ca). Crown land and tenures are still here as context
> layers, but the project's focus is now big trees and old growth.

## What it does

### Map layers (toggle in the Layers panel)

- **Big trees (registry)** — BC BigTree Registry champion points, bundled with the
  app and available on every pack. Tap for species, dimensions and score.
- **Old growth — legal (OGMA)** and **Old growth — proposed** — legal old-growth
  management areas plus non-legal / proposed reserves.
- **Old growth by age (VRI)** — forest polygons from the Vegetation Resources
  Inventory, filtered live by two sliders (**min age**, **min height**).
- **Crown land** and **Tenures** — public-land parcels and forest tenures for
  context, with an adjustable crown-fill opacity.
- **Hillshade** — terrain relief from a Terrarium-encoded DEM.

### Field toolkit (record your own trees)

- **Save tree pins** with the BC BigTree Registry fields (species, height, DBH,
  crown spread, town, elevation, …) plus attached **photos**.
- **Measure height** without a clinometer: a two-angle tilt-sensor hypsometer with
  an optional **live-camera crosshair** for precise aiming.
- **Auto-computed BigTree score** from height + DBH + crown (read-only).
- **Circumference → DBH** helper (kept in two-way sync).
- **Auto-filled elevation** sampled from the bundled DEM and **nearest town** from a
  bundled BC gazetteer — both filled only when left blank.
- **Species dropdown** of common BC trees (free text still allowed).
- **Export** all saved pins as **GeoJSON + CSV** to share off-device.

## Repo layout

```
/app        Capacitor 6 + Vite + TypeScript + MapLibre GL + PMTiles app
/pipeline   GIS build scripts (run on a workstation; never on device)
```

The two are deliberately separate (spec §4): the pipeline produces the shipped
`.pmtiles` archives; the app downloads and renders them offline.

## Tech stack (pinned, spec §3)

- Capacitor 6, TypeScript, Vite
- MapLibre GL JS renderer
- PMTiles single-file archives via the `pmtiles` protocol (no tile server)
- `@capacitor/geolocation`, `filesystem`, `preferences`, `network`, `share`
- `@capacitor/camera` + `motion` and `@capacitor-community/camera-preview` — power
  the tree photos and the tilt/camera height-measurement tool

## Quick start (desktop dev — milestone 1)

```bash
cd app
npm install
npm run gen:sample      # needs `tippecanoe` (brew install tippecanoe)
npm run dev             # open http://localhost:5173 → "Open" the Sample pack
```

`gen:sample` writes synthetic `basemap/crown/tenures-sample.pmtiles` into
`app/public/packs/` so the map renders locally without the full pipeline. It is
**not** real crown data — it just exercises the render / pmtiles / tap paths.

## Real data (pipeline)

See [`pipeline/README.md`](pipeline/README.md). In short: inspect the ownership
schema, filter crown parcels, tile crown + tenures with tippecanoe, build the OSM
basemap with planetiler, and emit a hosting `manifest.json`.

**Hosting is Cloudflare R2** — see [`pipeline/r2/README.md`](pipeline/r2/README.md)
for the full runbook (bucket + public access + CORS + `rclone` upload). The app's
host URL is set via `VITE_MANIFEST_BASE_URL` in `app/.env` (copy from
`app/.env.example`); it must match `MANIFEST_BASE_URL` used when generating the
manifest. R2 supports Range requests, so download resume works.

### Output archive sizes (spec §12 #7)

Filled in from `pipeline/05_style_manifest.sh` output after a real build:

| Archive | Zoom | Size |
|---------|------|------|
| `oldgrowth-bc.pmtiles` | 5–14 | _TBD_ |
| `vri-bc.pmtiles`       | 5–14 | _TBD_ |
| `crown-bc.pmtiles`     | 5–14 | _TBD_ |
| `tenures-bc.pmtiles`   | 6–14 | _TBD_ |
| `terrain-bc.pmtiles`   | 0–12 | _TBD_ |
| `basemap-bc.pmtiles`   | 0–14 | _TBD_ |

`bigtrees.pmtiles` (BC BigTree Registry points) ships bundled in the app, not per
pack.

## Offline / architecture notes

- **Zero runtime network** (spec §10): every map source is a local `pmtiles://`
  URL and glyphs are local. `src/data/offline-guard.ts` throws if any source
  points at a remote host — enforced before the style is handed to MapLibre.
- **PMTiles + Range requests** (spec §7): archives live in the Filesystem *Data*
  dir and load via `Capacitor.convertFileSrc()`. Local-scheme Range support is
  the key device risk (milestone 2) — verify on a real device; fall back to an
  embedded static file server if a platform doesn't honor Range on local files.
- **Download manager** (spec §8): `src/data/download-manager.ts` does manifest
  fetch (bundled fallback), region packs, HTTP-Range resume, SHA-256 verify, and
  version tracking via Preferences.

## iOS (native) — ready to build

The `ios/` project is **generated and configured** (committed to the repo):

- Capacitor 6.2 + plugins (Filesystem, Geolocation, Network, Preferences, Camera,
  Motion, CameraPreview, Share) via CocoaPods (`ios/App/Podfile`).
- `Info.plist`: `NSLocationWhenInUseUsageDescription` (when-in-use GPS, §11),
  `NSMotionUsageDescription` (tilt sensor for height measurement),
  `NSCameraUsageDescription` (camera aiming) and
  `ITSAppUsesNonExemptEncryption=false` (skips the export-compliance prompt).
- `appId` = `ca.crownland.offline`.
- Sample dev PMTiles are excluded from the device bundle (Vite `strip-sample-packs`).

Build on a machine with **full Xcode** (not just Command Line Tools):

```bash
cd app
npm install && npm run build
npx cap sync ios          # copies web assets + runs pod install
npx cap open ios          # opens App.xcworkspace — set signing team, then Run/Archive
```

Gotchas hit while setting this up (already handled, noted for CI):

- `pod install` needs a UTF-8 locale or it throws `Encoding::CompatibilityError`.
  Prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` in headless/CI shells.
- `cap sync`'s trailing `pod install` needs full Xcode; Command Line Tools alone
  copy assets fine but can't run that step.

### ⚠️ Milestone-2 device check (spec §7/§11) — must verify on a real device

PMTiles reads issue HTTP **Range** requests against local files served via
`Capacitor.convertFileSrc()`. Capacitor's iOS WKWebView scheme handler supports
Range for local files, so this is *expected* to work — but it is the key risk and
is **not verifiable in the simulator/CLT here**. On first device run, load a pack
and confirm tiles render. If they don't, fall back to an embedded local HTTP
server plugin (serve packs over `http://localhost` with Range) — see spec §7.

## Android (not yet generated)

```bash
npx cap add android
```

Then add to `android/app/src/main/AndroidManifest.xml`:
`ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` (when-in-use).

## Acceptance criteria (spec §12) — status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Airplane mode: basemap + crown render | ✅ arch (local pmtiles + offline guard); verify on device |
| 2 | Tap feature → attributes + coordinates | ✅ verified in dev |
| 3 | GPS "locate me", no network | ✅ wired (`location/`); verify on device |
| 4 | Long-press → decimal + DMS + copy | ✅ verified in dev |
| 5 | Smooth province-scale pan/zoom | ✅ vector tiles + pmtiles |
| 6 | Attribution + disclaimer present | ✅ verified in dev |
| 7 | Archive sizes documented | ⏳ after a real pipeline run |
| 8 | Runs on physical iOS + Android | ⏳ device build |

## Disclaimer

For reference only. **Not authoritative for legal boundaries.** Contains
information licensed under the Open Government Licence – British Columbia. ©
OpenStreetMap contributors (ODbL).
