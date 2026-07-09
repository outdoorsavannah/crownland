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
  NON_LEGAL_OGMA_PROVID: "OGMA ID",
  LEGALIZATION_FRPA_DATE: "Legalized (FRPA)",
  ORIGINAL_DECISION_DATE: "Decision date",
  ENABLING_DOCUMENT_TITLE: "Enabling document",
  FEATURE_AREA_SQM: "Area (m²)",
  // BC BigTree Registry fields.
  species: "Species",
  nickname: "Nickname",
  score: "BC BigTree score",
  height_m: "Height (m)",
  dbh_m: "Diameter DBH (m)",
  crown_m: "Crown spread (m)",
  town: "Nearest town",
  ownership: "Ownership",
  elevation_m: "Elevation (m)",
  measured: "Last measured",
  id: "Registry ID",
  // VRI (old-growth-by-age) fields.
  age: "Stand age (yr)",
  height: "Stand height (m)",
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
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  let kind: string;
  if (feature.source === "tenures") {
    kind = "Crown Tenure";
  } else if (feature.source === "bigtrees") {
    const nick = props.nickname ? String(props.nickname) : "";
    const species = props.species ? String(props.species) : "Big tree";
    kind = nick ? `${nick} (${species})` : species;
  } else if (feature.source === "oldgrowth") {
    kind =
      feature.sourceLayer === "oldgrowth_nonlegal"
        ? "Proposed OGMA (non-legal)"
        : "Old Growth Management Area";
  } else if (feature.source === "vri") {
    kind = "Forest stand (VRI)";
  } else {
    kind = "Crown Land";
  }
  const sheet = openSheet(kind, onClose);

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

interface PinSheetOpts {
  /** Present when viewing an already-saved pin (shows name + Delete). */
  saved?: { id: string; name: string };
  /** Called with the entered name to persist a new pin (shows Save controls). */
  onSave?: (name: string) => void | Promise<void>;
  /** Called to delete the saved pin. */
  onDelete?: () => void | Promise<void>;
}

/**
 * Long-press / search / saved-marker → sheet with lat/lng (decimal + DMS), a
 * copy button, and (per opts) either a "Save pin" name field or a "Delete"
 * action for an existing saved pin (spec §9 extension).
 */
export function showPinSheet(
  lngLat: { lng: number; lat: number },
  opts: PinSheetOpts = {},
): void {
  const sheet = openSheet(opts.saved ? opts.saved.name : "Dropped pin");
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

  if (opts.onSave) {
    const name = document.createElement("input");
    name.type = "text";
    name.className = "text-input";
    name.placeholder = "Name this pin (optional)";
    name.autocapitalize = "words";
    name.style.marginTop = "12px";

    const saveBtn = button("Save pin");
    saveBtn.style.marginTop = "10px";
    saveBtn.style.width = "100%";
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      await opts.onSave!(name.value.trim());
      sheet.close();
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveBtn.click();
    });
    sheet.body.append(name, saveBtn);
  }

  if (opts.saved && opts.onDelete) {
    const del = button("Delete pin");
    del.style.marginTop = "10px";
    del.style.width = "100%";
    del.style.borderColor = "var(--danger)";
    del.style.color = "var(--danger)";
    del.addEventListener("click", async () => {
      await opts.onDelete!();
      sheet.close();
    });
    sheet.body.append(del);
  }
}
