import type { MapGeoJSONFeature } from "maplibre-gl";
import { openSheet, kvGrid, button } from "./sheet";
import { fmtDecimal, fmtDMS, copyText } from "./coords";

// Attribute keys we surface first (spec §5 tenure attributes / crown fields),
// with friendly labels. Unknown keys are shown afterwards as-is.
// Friendly labels for the fields we surface first. Keys match the real
// ParcelMap (OWNER_TYPE) and TA_CROWN_TENURES_SVW attribute names.
const PREFERRED: Record<string, string> = {
  OWNER_TYPE: "Ownership",
  TENURE_TYPE: "Tenure type",
  TENURE_SUBTYPE: "Subtype",
  TENURE_PURPOSE: "Purpose",
  TENURE_SUBPURPOSE: "Subpurpose",
  TENURE_STAGE: "Stage",
  TENURE_STATUS: "Status",
  TENURE_LOCATION: "Location",
  TENURE_EXPIRY: "Expiry",
  CROWN_LANDS_FILE: "Crown lands file",
  TENURE_AREA_IN_HECTARES: "Area (ha)",
  AREA_HA: "Area (ha)",
  INTRID_SID: "Interest ID",
  // OGMA legal (old growth) fields.
  OGMA_TYPE: "OGMA type",
  OGMA_PRIMARY_REASON: "Primary reason",
  LEGAL_OGMA_PROVID: "OGMA ID",
  LEGALIZATION_FRPA_DATE: "Legalized (FRPA)",
  ENABLING_DOCUMENT_TITLE: "Enabling document",
  FEATURE_AREA_SQM: "Area (m²)",
};

function attributeRows(props: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = [];
  const seen = new Set<string>();
  for (const [key, label] of Object.entries(PREFERRED)) {
    if (key in props && props[key] != null && props[key] !== "") {
      rows.push([label, String(props[key])]);
      seen.add(key);
    }
  }
  for (const [k, v] of Object.entries(props)) {
    if (seen.has(k) || v == null || v === "") continue;
    rows.push([k, String(v)]);
  }
  return rows;
}

/** Tap on a crown/parcel/tenure feature → attributes + tap coords (spec §9). */
export function showFeatureSheet(
  feature: MapGeoJSONFeature,
  lngLat: { lng: number; lat: number },
  onClose?: () => void,
): void {
  const kind =
    feature.source === "tenures"
      ? "Crown Tenure"
      : feature.source === "oldgrowth"
        ? "Old Growth Management Area"
        : "Crown Land";
  const sheet = openSheet(kind, onClose);
  const props = (feature.properties ?? {}) as Record<string, unknown>;

  const rows = attributeRows(props);
  sheet.body.append(
    rows.length
      ? kvGrid(rows)
      : Object.assign(document.createElement("p"), {
          textContent: "Crown land (reference only — not authoritative for boundaries).",
          className: "disclaimer",
        }),
  );

  // Tapped coordinate — the whole bubble is a copy surface (tap to copy), with
  // an explicit Copy affordance on the right.
  const dec = fmtDecimal(lngLat.lat, lngLat.lng);
  const coord = document.createElement("button");
  coord.type = "button";
  coord.className = "note note-copy";
  coord.style.marginTop = "12px";

  const label = document.createElement("span");
  label.textContent = `Tapped: ${dec}`;
  const copy = document.createElement("span");
  copy.className = "note-copy-btn";
  copy.textContent = "Copy";
  coord.append(label, copy);

  coord.addEventListener("click", async () => {
    const ok = await copyText(dec);
    copy.textContent = ok ? "Copied ✓" : "Failed";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });
  sheet.body.append(coord);
}

/** Long-press → dropped pin with lat/lng in decimal + DMS and a copy button. */
export function showPinSheet(lngLat: { lng: number; lat: number }): void {
  const sheet = openSheet("Dropped pin");
  const dec = fmtDecimal(lngLat.lat, lngLat.lng, 6);
  const dms = fmtDMS(lngLat.lat, lngLat.lng);

  sheet.body.append(
    kvGrid([
      ["Decimal", dec],
      ["DMS", dms],
    ]),
  );

  const copyBtn = button("Copy coordinates", { primary: true });
  copyBtn.style.marginTop = "14px";
  copyBtn.style.width = "100%";
  copyBtn.addEventListener("click", async () => {
    // Copy decimal only (DMS stays visible above for reference).
    const ok = await copyText(dec);
    copyBtn.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => (copyBtn.textContent = "Copy coordinates"), 1500);
  });
  sheet.body.append(copyBtn);
}
