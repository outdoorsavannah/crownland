import { defineConfig, type Plugin } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// The built-in sample pack (public/packs) ships in the app bundle so there is
// always something that renders offline — it doubles as the milestone-2
// Range-request self-test on device. For a lean store release you can drop it
// (~190 KB) by building with STRIP_SAMPLE_PACKS=1. Dev serving is unaffected.
function stripSamplePacks(): Plugin {
  return {
    name: "strip-sample-packs",
    apply: "build",
    async closeBundle() {
      if (!process.env.STRIP_SAMPLE_PACKS) return;
      await rm(resolve(__dirname, "dist/packs"), { recursive: true, force: true });
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
