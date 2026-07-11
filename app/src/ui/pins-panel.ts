import { openSheet, button } from "./sheet";
import { loadPins, type SavedPin } from "../data/saved-pins";
import { exportPins } from "../data/pin-export";
import { fmtDecimal } from "./coords";
import { toast } from "./toast";

// "Saved pins" list sheet (spec §9 extension). Tap a pin to fly to it; ✕ deletes.

export async function openSavedPins(
  onGo: (pin: SavedPin) => void,
  onDelete: (pin: SavedPin) => Promise<void>,
): Promise<void> {
  const sheet = openSheet("Saved pins");

  const render = async () => {
    sheet.body.innerHTML = "";
    const pins = (await loadPins()).sort((a, b) => b.createdAt - a.createdAt);

    if (!pins.length) {
      const p = document.createElement("p");
      p.className = "disclaimer";
      p.textContent =
        "No saved pins yet. Long-press the map (or search coordinates), then tap “Save pin”.";
      sheet.body.append(p);
      return;
    }

    for (const pin of pins) {
      const row = document.createElement("div");
      row.className = "row pin-row";

      const go = document.createElement("button");
      go.className = "pin-go";
      const nm = document.createElement("div");
      nm.className = "pin-name";
      nm.textContent = pin.kind === "tree" ? `🌲 ${pin.name}` : pin.name;
      const co = document.createElement("div");
      co.className = "pin-coord";
      co.textContent = fmtDecimal(pin.lat, pin.lng);
      go.append(nm, co);
      go.addEventListener("click", () => {
        sheet.close();
        onGo(pin);
      });

      const del = document.createElement("button");
      del.className = "pin-del";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Delete ${pin.name}`);
      del.addEventListener("click", async () => {
        await onDelete(pin);
        await render();
      });

      row.append(go, del);
      sheet.body.append(row);
    }

    const exportBtn = button("Export all (GeoJSON + CSV)");
    exportBtn.style.marginTop = "14px";
    exportBtn.style.width = "100%";
    exportBtn.addEventListener("click", async () => {
      exportBtn.disabled = true;
      try {
        const n = await exportPins();
        toast(n ? `Exported ${n} pin${n === 1 ? "" : "s"}` : "Nothing to export");
      } catch {
        toast("Export failed");
      }
      exportBtn.disabled = false;
    });
    sheet.body.append(exportBtn);
  };

  await render();
}
