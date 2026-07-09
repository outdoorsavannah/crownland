// Unit test for the download resume-vs-restart decision (the fix for the
// checksum mismatch on an "Update" that changes an archive's size).
// Run: node scripts/test-resume.mjs   (Node 22+; strips the .ts types on import)

import { resumeDecision } from "../src/data/resume.ts";

const OLD = "aaaa";
const NEW = "bbbb";
let failures = 0;

function check(name, got, want) {
  const ok = got.resumeFrom === want.resumeFrom && got.deleteStale === want.deleteStale;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${JSON.stringify(got)}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(want)}`);
    failures++;
  }
}

// THE BUG: complete OLD version (6.8 MB) on disk, NEW version is larger (8.4 MB),
// no recorded marker. Must NOT resume — delete and download fresh.
check(
  "update: old full file smaller than new -> fresh",
  resumeDecision({ onDisk: 6803834, entryBytes: 8400000, entrySha: NEW, recordedSha: undefined }),
  { resumeFrom: 0, deleteStale: true },
);

// Genuine interrupted partial of the CURRENT version -> resume.
check(
  "resume: partial of current version",
  resumeDecision({ onDisk: 4000000, entryBytes: 8400000, entrySha: NEW, recordedSha: NEW }),
  { resumeFrom: 4000000, deleteStale: false },
);

// Partial left over from a PREVIOUS version (marker mismatch) -> fresh.
check(
  "stale: partial from old version -> fresh",
  resumeDecision({ onDisk: 4000000, entryBytes: 8400000, entrySha: NEW, recordedSha: OLD }),
  { resumeFrom: 0, deleteStale: true },
);

// Nothing on disk -> fresh, nothing to delete.
check(
  "empty: no file -> fresh",
  resumeDecision({ onDisk: 0, entryBytes: 8400000, entrySha: NEW, recordedSha: undefined }),
  { resumeFrom: 0, deleteStale: false },
);

// Old version LARGER than new (shrunk) -> not a prefix -> fresh + delete.
check(
  "update: old full file larger than new -> fresh",
  resumeDecision({ onDisk: 9000000, entryBytes: 8400000, entrySha: NEW, recordedSha: undefined }),
  { resumeFrom: 0, deleteStale: true },
);

// Same size, different content (marker mismatch) -> not resumable (onDisk == bytes
// is handled earlier by the verify-skip path; here it must not resume).
check(
  "same size, wrong version -> fresh",
  resumeDecision({ onDisk: 8400000, entryBytes: 8400000, entrySha: NEW, recordedSha: OLD }),
  { resumeFrom: 0, deleteStale: true },
);

console.log(failures ? `\n${failures} FAILED` : "\nAll resume-decision tests passed");
process.exit(failures ? 1 : 0);
