// Unit test for the two-angle tree-height (hypsometer) math.
// Run: node scripts/test-height.mjs   (Node 22+; strips the .ts types on import)

import { heightFromAngles, heightFromTop } from "../src/measure/height.ts";

let failures = 0;

function close(name, got, want, tol = 0.05) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${got.toFixed(3)}`);
  if (!ok) {
    console.log(`      expected ~${want}`);
    failures++;
  }
}

// Top at +45° and base at 0° (eye level == trunk base), D=20 -> height 20.
close("45° top, level base", heightFromAngles(20, 45, 0), 20);

// Base 5° below horizontal adds D*tan(5°) ≈ 1.75 to the 20 m above.
close("base below eye level", heightFromAngles(20, 45, -5), 20 + 20 * Math.tan((5 * Math.PI) / 180));

// Both angles above horizontal (looking up a slope): difference, not sum.
close("both above horizontal", heightFromAngles(30, 40, 10), 30 * (Math.tan((40 * Math.PI) / 180) - Math.tan((10 * Math.PI) / 180)));

// Symmetric: top +30, base -30, D=15 -> 2*15*tan(30°).
close("symmetric top/base", heightFromAngles(15, 30, -30), 2 * 15 * Math.tan((30 * Math.PI) / 180));

// Single-angle fallback: D*tan(top) + eye height.
close("single angle + eye height", heightFromTop(20, 45, 1.6), 21.6);

console.log(failures ? `\n${failures} FAILED` : "\nAll height tests passed");
process.exit(failures ? 1 : 0);
