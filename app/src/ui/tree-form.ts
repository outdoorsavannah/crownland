import { openSheet, kvGrid, button } from "./sheet";
import { fmtDecimal, fmtDMS } from "./coords";
import { TREE_FIELD_LABELS, type TreeFields, type SavedPin } from "../data/saved-pins";
import { pickAndStorePhotos, photoUrl, deletePinPhotos } from "../data/photos";

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

  // One labelled input per registry field.
  const inputs = new Map<keyof TreeFields, HTMLInputElement>();
  for (const [key, label] of TREE_FIELD_LABELS) {
    const field = document.createElement("label");
    field.className = "tree-field";
    const cap = document.createElement("span");
    cap.textContent = label;
    const input = document.createElement("input");
    input.className = "text-input";
    input.value = opts.initial?.tree?.[key] ?? "";
    if (NUMERIC.has(key)) input.inputMode = "decimal";
    if (key === "species" || key === "nickname" || key === "town") input.autocapitalize = "words";
    field.append(cap, input);
    inputs.set(key, input);
    sheet.body.append(field);
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
