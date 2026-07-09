import { openSheet, button } from "./sheet";
import type { Manifest } from "../data/manifest";

// Attribution + disclaimer panel (spec §9, §12 acceptance #6). Attribution text
// comes from the manifest so it can be corrected without an app update.
// `onSwitchPacks` returns the user to the pack list / download screen.

export function openInfoPanel(manifest: Manifest, onSwitchPacks?: () => void): void {
  const sheet = openSheet("About & attribution");

  const p = (text: string, cls = "disclaimer") => {
    const el = document.createElement("p");
    el.className = cls;
    el.textContent = text;
    return el;
  };

  if (onSwitchPacks) {
    const switchBtn = button("Switch data pack", { primary: true });
    switchBtn.style.width = "100%";
    switchBtn.style.marginBottom = "16px";
    switchBtn.addEventListener("click", () => {
      sheet.close();
      onSwitchPacks();
    });
    sheet.body.append(switchBtn);
  }

  sheet.body.append(
    p(manifest.attribution.ogl),
    p(manifest.attribution.osm),
    p(
      "Big trees: BC BigTree Registry, UBC Faculty of Forestry " +
        "(bigtrees.forestry.ubc.ca). Point locations shown with attribution; some " +
        "registry trees have withheld locations and are not shown.",
    ),
    p(
      "Please protect these trees: stay on established trails, keep off the root " +
        "zone, and take only photos. Many are old-growth giants that damage easily.",
      "note",
    ),
    p(
      "Disclaimer: This map is for reference only and is NOT authoritative for " +
        "legal boundaries. Do not rely on it to determine land ownership, tenure, " +
        "or access rights. Verify with official BC government sources.",
      "note",
    ),
    p(
      "Personal-use re-creation built from public BC open-data sources. Not " +
        "affiliated with crownlandmap.ca or the Province of British Columbia.",
    ),
  );
}
