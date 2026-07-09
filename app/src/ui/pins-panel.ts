import { openSheet } from "./sheet";
import { loadPins, type SavedPin } from "../data/saved-pins";
import { fmtDecimal } from "./coords";

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
      nm.textContent = pin.name;
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
  };

  await render();
}
