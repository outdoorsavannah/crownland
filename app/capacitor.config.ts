import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ca.crownland.offline",
  appName: "BC Crown Land",
  webDir: "dist",
  // No `server.url` — the app must run fully from the bundled web assets so it
  // works offline. Remote dev-server live reload is intentionally not wired.
  android: {
    // Allow the pmtiles protocol handler to issue Range requests against
    // capacitor-served local files.
    allowMixedContent: false,
  },
  plugins: {
    Geolocation: {},
  },
};

export default config;
