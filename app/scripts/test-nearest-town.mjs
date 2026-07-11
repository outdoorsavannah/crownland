// Unit test for offline nearest-town lookup.
// Run: node scripts/test-nearest-town.mjs   (Node 22+; strips .ts types on import)

import { nearestTown } from "../src/data/bc-towns.ts";

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${got}`);
  if (!ok) {
    console.log(`      expected ${want}`);
    failures++;
  }
}

// Near downtown Victoria.
check("Victoria", nearestTown(48.43, -123.37).name, "Victoria");
// Cathedral Grove (big trees) is between Port Alberni and Qualicum.
check("Cathedral Grove -> Port Alberni", nearestTown(49.28, -124.66).name, "Port Alberni");
// Deep northern interior near Fort Nelson.
check("northern BC", nearestTown(58.8, -122.7).name, "Fort Nelson");
// A point right at Tofino.
check("Tofino", nearestTown(49.153, -125.906).name, "Tofino");

console.log(failures ? `\n${failures} FAILED` : "\nAll nearest-town tests passed");
process.exit(failures ? 1 : 0);
