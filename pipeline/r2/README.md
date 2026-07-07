# Hosting the packs on Cloudflare R2

The app downloads pack archives + `manifest.json` from a static host. R2 is a good
fit: S3-compatible, supports HTTP **Range** requests (needed for download resume),
and has **no egress fees**.

## One-time R2 setup

1. **Create a bucket** (Cloudflare dashboard → R2 → Create bucket), e.g. `crownland`.

2. **Make it publicly readable** — pick one:
   - **Custom domain** (recommended for production): bucket → Settings → Public
     access → Connect Domain, e.g. `data.yourdomain.com`. Base URL becomes
     `https://data.yourdomain.com/`.
   - **r2.dev** (testing only, rate-limited): enable the `r2.dev` subdomain. Base
     URL becomes `https://pub-<hash>.r2.dev/`.

3. **Apply CORS** so the app (running from the Capacitor `capacitor://localhost`
   webview origin) can `fetch()` the archives with `Range`. Use [`cors.json`](cors.json):
   - Dashboard: bucket → Settings → CORS Policy → paste `cors.json`, **or**
   - S3 API: `aws s3api put-bucket-cors --bucket crownland --cors-configuration file://cors.json --endpoint-url https://<accountid>.r2.cloudflarestorage.com`

4. **Create an R2 API token** (Account → R2 → Manage API Tokens, Object
   Read & Write) and configure rclone:
   ```
   rclone config
   #   name: r2 · type: s3 · provider: Cloudflare
   #   access_key_id / secret_access_key: from the R2 token
   #   endpoint: https://<accountid>.r2.cloudflarestorage.com
   ```

## Each build

```bash
cd pipeline
export MANIFEST_BASE_URL="https://data.yourdomain.com/"   # your public base URL
export R2_BUCKET="crownland"

./run_all.sh                 # builds out/*.pmtiles
./make_region_packs.sh       # optional: out/regions/*.pmtiles
./05_style_manifest.sh       # regenerates out/manifest.json (picks up regions)
./r2/upload.sh               # uploads everything to the bucket root
```

Then point the app at the same URL and rebuild:

```bash
cd ../app
echo 'VITE_MANIFEST_BASE_URL=https://data.yourdomain.com/' > .env
npm run build && npx cap copy ios
```

## Verify Range works (the milestone-2 dependency)

```bash
curl -I -H 'Range: bytes=0-1' https://data.yourdomain.com/crown-bc.pmtiles
# expect: HTTP/2 206, Content-Range: bytes 0-1/<size>, Accept-Ranges: bytes
```

If you get `200` instead of `206`, downloads still work but **resume won't** —
check that you're hitting R2 directly (not a proxy/cache that strips Range).

## Notes

- Everything is uploaded to the **bucket root**; `manifest.json` file `url`s are
  bare names that resolve against `baseUrl`.
- `manifest.json` carries real `bytes` + `sha256` per archive — the app verifies
  checksums after download and shows sizes/free-space on the download screen.
- The `sample` pack in the manifest is `bundled: true` (ships in the app, not on
  R2); keep it so it stays in the pack list after the app loads the remote manifest.
