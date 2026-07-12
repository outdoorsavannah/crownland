import { openSheet, kvGrid, button } from "./sheet";
import { fmtDecimal, fmtDMS } from "./coords";
import { TREE_FIELD_LABELS, type TreeFields, type SavedPin } from "../data/saved-pins";
import { pickAndStorePhotos, photoUrl, deletePinPhotos } from "../data/photos";
import { openHeightSheet } from "./height-sheet";
import { BC_TREE_SPECIES } from "../data/bc-species";
import { bigTreeScore } from "../measure/bigtree-score";
import { nearestTown } from "../data/bc-towns";
import type { ElevationSampler } from "../measure/elevation";

/** Local date as YYYY-MM-DD for a <input type="date"> default. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Add / edit a tree pin: the BC BigTree Registry fields plus attached photos.
// Reused for both creating a new tree and editing an existing one.

const NUMERIC = new Set<keyof TreeFields>([
  "score",
  "height_m",
  "dbh_m",
  "crown_m",
  "elevation_m",
]);

/** Derive a marker/list label from the tree fields. */
export function treeName(t: TreeFields): string {
  return t.nickname?.trim() || t.species?.trim() || "Tree";
}

interface TreeFormOpts {
  /** Pre-generated id (new tree) or the existing pin's id (edit) — photo folder. */
  pinId: string;
  /** Existing record when editing; absent when creating. */
  initial?: SavedPin;
  /** Seed the nickname field on a new tree (from the "Name this pin" text). */
  initialNickname?: string;
  /** Samples elevation from the pack's DEM; used to auto-fill an empty field. */
  getElevation?: ElevationSampler;
  onSubmit: (fields: TreeFields, photos: string[], name: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

export function openTreeForm(
  lngLat: { lng: number; lat: number },
  opts: TreeFormOpts,
): void {
  const editing = !!opts.initial;
  let photos = [...(opts.initial?.photos ?? [])];
  let saved = false;

  const sheet = openSheet(
    editing ? treeName(opts.initial!.tree ?? {}) : "Save tree 🌲",
    () => {
      // Cancelled a brand-new tree after attaching photos → clean up orphans.
      if (!editing && !saved && photos.length) void deletePinPhotos(opts.pinId);
    },
  );

  sheet.body.append(
    kvGrid([
      ["Decimal", fmtDecimal(lngLat.lat, lngLat.lng, 6)],
      ["DMS", fmtDMS(lngLat.lat, lngLat.lng)],
    ]),
  );

  // Round to millimetre precision (values are in metres).
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  // One labelled input per registry field.
  const inputs = new Map<keyof TreeFields, HTMLInputElement>();
  let circInput: HTMLInputElement | null = null; // helper above DBH (not stored)
  let speciesSelect: HTMLSelectElement | null = null; // dropdown that fills species
  for (const [key, label] of TREE_FIELD_LABELS) {
    // Species holds two controls (dropdown + custom text). A <label> may wrap
    // only one, and on iOS WebKit two-in-a-label makes the tap re-dispatch and
    // the dropdown open-then-close — so use a plain <div> for it.
    const field = document.createElement(key === "species" ? "div" : "label");
    field.className = "tree-field";
    const cap = document.createElement("span");
    cap.textContent = label;
    const input = document.createElement("input");
    input.className = "text-input";
    input.value =
      opts.initial?.tree?.[key] ??
      (key === "nickname"
        ? opts.initialNickname ?? ""
        : key === "measured" && !editing
          ? today() // new tree: default "Last measured" to today
          : "");
    if (NUMERIC.has(key)) input.inputMode = "decimal";
    if (key === "species" || key === "nickname" || key === "town") input.autocapitalize = "words";

    // Last measured → native date picker.
    if (key === "measured") input.type = "date";

    // Score is derived from height + DBH + crown, so it is read-only/computed.
    if (key === "score") {
      input.readOnly = true;
      input.placeholder = "auto from height, DBH, crown";
    }

    // Species → a real dropdown of common BC species, backed by the text input
    // for custom entries. (A <datalist> only shows a faint hint on iOS.)
    if (key === "species") {
      input.placeholder = "or type a species";
      const sel = document.createElement("select");
      sel.className = "text-input select-input";
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "Choose common species…";
      sel.append(ph);
      for (const s of BC_TREE_SPECIES) {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        sel.append(o);
      }
      speciesSelect = sel;
    }

    // Circumference helper directly above DBH: computes DBH = circumference / π.
    if (key === "dbh_m") {
      const cField = document.createElement("label");
      cField.className = "tree-field";
      const cCap = document.createElement("span");
      cCap.textContent = "Circumference (m)";
      circInput = document.createElement("input");
      circInput.className = "text-input";
      circInput.inputMode = "decimal";
      circInput.placeholder = "→ fills DBH";
      const dbh0 = opts.initial?.tree?.dbh_m;
      if (dbh0) circInput.value = String(round3(parseFloat(dbh0) * Math.PI));
      cField.append(cCap, circInput);
      sheet.body.append(cField);
    }

    field.append(cap, input);
    inputs.set(key, input);
    sheet.body.append(field);

    // Place the species dropdown above its text input and keep the two in sync:
    // picking fills the text field; typing a listed name re-selects it.
    if (key === "species" && speciesSelect) {
      const sel = speciesSelect;
      field.insertBefore(sel, input);
      sel.value = BC_TREE_SPECIES.includes(input.value) ? input.value : "";
      sel.addEventListener("change", () => {
        if (sel.value) input.value = sel.value;
      });
      input.addEventListener("input", () => {
        sel.value = BC_TREE_SPECIES.includes(input.value) ? input.value : "";
      });
    }

    // Height gets a measure tool that fills the input via the device tilt sensor.
    if (key === "height_m") {
      const measure = button("Measure 📐");
      measure.className += " measure-btn";
      measure.addEventListener("click", () =>
        openHeightSheet((h) => {
          input.value = h;
          input.dispatchEvent(new Event("input")); // refresh the computed score
        }),
      );
      sheet.body.append(measure);
    }
  }

  // Keep the BC BigTree score in sync with height + DBH + crown as they change.
  const scoreInput = inputs.get("score")!;
  const recomputeScore = () => {
    const s = bigTreeScore(
      parseFloat(inputs.get("height_m")!.value),
      parseFloat(inputs.get("dbh_m")!.value),
      parseFloat(inputs.get("crown_m")!.value),
    );
    if (s !== null) scoreInput.value = String(s);
  };
  for (const k of ["height_m", "dbh_m", "crown_m"] as const) {
    inputs.get(k)!.addEventListener("input", recomputeScore);
  }

  // Keep circumference and DBH in sync (DBH = circumference / π), so either can
  // be entered. Cross-updates set `.value` directly (no event) to avoid a loop.
  const dbhInput = inputs.get("dbh_m")!;
  if (circInput) {
    const circ = circInput;
    circ.addEventListener("input", () => {
      const c = parseFloat(circ.value);
      dbhInput.value = Number.isFinite(c) ? String(round3(c / Math.PI)) : "";
      recomputeScore();
    });
    dbhInput.addEventListener("input", () => {
      const d = parseFloat(dbhInput.value);
      circ.value = Number.isFinite(d) ? String(round3(d * Math.PI)) : "";
    });
  }

  // Auto-fill location-derived fields when they are empty (non-destructive:
  // never overwrites a value the user or registry already provided).
  const townInput = inputs.get("town")!;
  if (!townInput.value.trim()) {
    const near = nearestTown(lngLat.lat, lngLat.lng);
    if (near) townInput.value = near.name;
  }
  const elevInput = inputs.get("elevation_m")!;
  if (!elevInput.value.trim() && opts.getElevation) {
    void opts.getElevation(lngLat.lng, lngLat.lat).then((m) => {
      if (m !== null && !elevInput.value.trim()) elevInput.value = String(Math.round(m));
    });
  }

  // ---- Photos ----
  const photosCap = document.createElement("span");
  photosCap.className = "tree-field-cap";
  photosCap.textContent = "Photos";
  const gallery = document.createElement("div");
  gallery.className = "tree-photos";

  const renderGallery = async () => {
    gallery.innerHTML = "";
    for (const rel of photos) {
      const wrap = document.createElement("div");
      wrap.className = "tree-photo";
      const img = document.createElement("img");
      img.src = await photoUrl(rel);
      const rm = document.createElement("button");
      rm.className = "tree-photo-rm";
      rm.textContent = "✕";
      rm.setAttribute("aria-label", "Remove photo");
      rm.addEventListener("click", () => {
        photos = photos.filter((p) => p !== rel);
        void renderGallery();
      });
      wrap.append(img, rm);
      gallery.append(wrap);
    }
  };

  const addPhotos = button("Add photos");
  addPhotos.style.marginTop = "8px";
  addPhotos.style.width = "100%";
  addPhotos.addEventListener("click", async () => {
    addPhotos.disabled = true;
    const added = await pickAndStorePhotos(opts.pinId);
    photos.push(...added);
    await renderGallery();
    addPhotos.disabled = false;
  });

  sheet.body.append(photosCap, gallery, addPhotos);
  void renderGallery();

  // ---- Save / Delete ----
  const save = button(editing ? "Save changes" : "Save tree", { primary: true });
  save.style.marginTop = "16px";
  save.style.width = "100%";
  save.addEventListener("click", async () => {
    save.disabled = true;
    const fields: TreeFields = {};
    for (const [key, input] of inputs) {
      const v = input.value.trim();
      if (v) fields[key] = v;
    }
    saved = true;
    await opts.onSubmit(fields, photos, treeName(fields));
    sheet.close();
  });
  sheet.body.append(save);

  if (editing && opts.onDelete) {
    const del = button("Delete tree");
    del.style.marginTop = "10px";
    del.style.width = "100%";
    del.style.borderColor = "var(--danger)";
    del.style.color = "var(--danger)";
    del.addEventListener("click", async () => {
      saved = true; // deletion handles photo cleanup itself
      await opts.onDelete!();
      sheet.close();
    });
    sheet.body.append(del);
  }
}
