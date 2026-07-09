import { defineConfig, type Plugin } from "vite";
import { rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// The built-in sample pack (public/packs) ships in the app bundle so there is
// always something that renders offline — it doubles as the milestone-2
// Range-request self-test on device. For a lean store release you can drop it
// by building with STRIP_SAMPLE_PACKS=1. Dev serving is unaffected.
//
// NOTE: only the *-sample.pmtiles files are stripped. bigtrees.pmtiles is real
// shipped data (a bundled, always-on layer) and is always kept.
function stripSamplePacks(): Plugin {
  return {
    name: "strip-sample-packs",
    apply: "build",
    async closeBundle() {
      if (!process.env.STRIP_SAMPLE_PACKS) return;
      const dir = resolve(__dirname, "dist/packs");
      const files = await readdir(dir).catch(() => [] as string[]);
      await Promise.all(
        files
          .filter((f) => f.endsWith("-sample.pmtiles"))
          .map((f) => rm(resolve(dir, f), { force: true })),
      );
    },
  };
}

// Vite config. `base: "./"` produces relative asset URLs so the built bundle
// works when served from Capacitor's local scheme (capacitor://localhost /
// https://localhost) on device.
export default defineConfig({
  plugins: [stripSamplePacks()],
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: true,
  },
});
