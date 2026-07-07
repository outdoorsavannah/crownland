import type { StyleSpecification } from "maplibre-gl";

// Spec §10: "Add a guard/assertion that no map source points at a remote URL."
//
// We allow only:
//   - pmtiles:// URLs (whose inner URL must itself be local — see below)
//   - relative URLs / the app's own origin (capacitor local scheme, localhost,
//     file:) for glyphs and inline data.
// Anything pointing at an off-device http(s) host is a bug that would break
// airplane-mode rendering, so we throw.

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;

function isLocalUrl(raw: string): boolean {
  // Strip a leading pmtiles:// wrapper and validate the inner URL.
  const inner = raw.startsWith("pmtiles://") ? raw.slice("pmtiles://".length) : raw;

  // Relative paths and non-http schemes used by Capacitor are local.
  if (!/^https?:\/\//i.test(inner)) {
    // capacitor://, file://, blob:, data:, or a relative path — all local.
    return true;
  }
  try {
    const u = new URL(inner);
    // Capacitor serves local files from https://localhost or capacitor://localhost.
    return LOCAL_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export function assertOfflineStyle(style: StyleSpecification): void {
  const offenders: string[] = [];

  for (const [name, src] of Object.entries(style.sources ?? {})) {
    const s = src as { url?: string; tiles?: string[] };
    if (s.url && !isLocalUrl(s.url)) offenders.push(`source "${name}": ${s.url}`);
    for (const t of s.tiles ?? []) {
      if (!isLocalUrl(t)) offenders.push(`source "${name}" tile: ${t}`);
    }
  }

  if (style.glyphs && !isLocalUrl(style.glyphs)) {
    offenders.push(`glyphs: ${style.glyphs}`);
  }
  if (style.sprite && typeof style.sprite === "string" && !isLocalUrl(style.sprite)) {
    offenders.push(`sprite: ${style.sprite}`);
  }

  if (offenders.length) {
    throw new Error(
      "Offline guard: map style references remote URLs (spec §10):\n  " +
        offenders.join("\n  "),
    );
  }
}
