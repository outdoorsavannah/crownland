// Unit test for the BC BigTree importance-score formula.
// Run: node scripts/test-bigtree-score.mjs   (Node 22+; strips .ts types on import)

import { bigTreeScore } from "../src/measure/bigtree-score.ts";

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${got}`);
  if (!ok) {
    console.log(`      expected ${want}`);
    failures++;
  }
}

// H=70 m, DBH=3 m (circ ≈ 942.5 cm), crown=20 m:
// 3.2808*70 + 0.3937*(π*100*3) + 0.8202*20
//   = 229.656 + 371.06 + 16.404 = 617.12 -> 617
check("large redcedar", bigTreeScore(70, 3, 20), 617);

// H=30, DBH=1, crown=10: 98.424 + 123.685 + 8.202 = 230.31 -> 230
check("mid tree", bigTreeScore(30, 1, 10), 230);

// Any missing/zero/negative measurement -> null.
check("missing crown", bigTreeScore(30, 1, 0), null);
check("negative dbh", bigTreeScore(30, -1, 10), null);
check("NaN height", bigTreeScore(NaN, 1, 10), null);

console.log(failures ? `\n${failures} FAILED` : "\nAll bigtree-score tests passed");
process.exit(failures ? 1 : 0);
