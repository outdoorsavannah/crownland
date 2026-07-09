import type maplibregl from "maplibre-gl";
import { openSheet, button } from "./sheet";
import { parseCoordinates } from "./coords";

// Coordinate search (spec §9 extension). The app is fully offline, so there is
// no place-name geocoder — search parses a coordinate string (decimal degrees or
// DMS) and flies the map there. `onResult` receives the parsed location.

export function openSearch(
  _map: maplibregl.Map,
  onResult: (lngLat: { lng: number; lat: number }) => void,
): void {
  const sheet = openSheet("Search coordinates");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "text-input";
  input.placeholder = "48.5, -123.3   or   48°30'N 123°18'W";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.enterKeyHint = "go";

  const hint = document.createElement("p");
  hint.className = "disclaimer";
  hint.textContent =
    "Enter latitude, longitude in decimal degrees or DMS. Offline map — place-name search isn't available.";

  const err = document.createElement("p");
  err.className = "disclaimer";
  err.style.color = "var(--danger)";
  err.hidden = true;

  const go = button("Go", { primary: true });
  go.style.width = "100%";
  go.style.marginTop = "12px";

  const submit = () => {
    const parsed = parseCoordinates(input.value);
    if (!parsed) {
      err.hidden = false;
      err.textContent = 'Couldn’t read those coordinates. Try "48.5, -123.3".';
      return;
    }
    sheet.close();
    onResult(parsed);
  };

  go.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });

  sheet.body.append(input, hint, err, go);
  // Focus after the open transition so the keyboard opens reliably on device.
  setTimeout(() => input.focus(), 60);
}
