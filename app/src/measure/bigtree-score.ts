// BC BigTree Registry "tree importance score" (a.k.a. US Champion Tree score).
// Metric formula (bigtrees.forestry.ubc.ca/measuring-trees/tree-importance-score):
//   3.2808 points / m of height
// + 0.3937 points / cm of trunk *circumference*
// + 0.8202 points / m of average crown spread
//
// The registry (and this form) records DBH — the *diameter* at breast height —
// so circumference = π · DBH. With DBH and crown in metres:
//   0.3937 × (π · 100 · DBH_m) = 123.685 · DBH_m
// Scores are whole numbers.

/** Big-tree score from height, DBH and crown spread (all metres). Returns null
 *  unless all three are positive finite numbers. */
export function bigTreeScore(heightM: number, dbhM: number, crownM: number): number | null {
  if (![heightM, dbhM, crownM].every((n) => Number.isFinite(n) && n > 0)) return null;
  const circumferenceCm = Math.PI * 100 * dbhM;
  return Math.round(3.2808 * heightM + 0.3937 * circumferenceCm + 0.8202 * crownM);
}
