// Pure resume-vs-restart decision for a downloading archive. Kept import-free so
// it is trivially unit-testable (see scripts/test-resume.mjs).
//
// A partially-downloaded file is only safe to resume when it is a strict prefix
// of the TARGET version: smaller than the target's byte size AND a recorded
// marker proves those bytes belong to this exact sha256. Anything else on disk —
// a complete file from a previous version (an "Update"), or a partial left over
// from an older version — is stale and must be deleted, otherwise a Range
// request splices mismatched bytes together and the checksum fails.

export interface ResumeInput {
  /** Bytes currently on disk for this archive (0 if none). */
  onDisk: number;
  /** Target archive size from the manifest. */
  entryBytes: number;
  /** Target archive sha256 from the manifest. */
  entrySha: string;
  /** sha256 recorded for the on-disk partial, if any. */
  recordedSha?: string;
}

export interface ResumeDecision {
  /** Byte offset to resume from (0 = download the whole file fresh). */
  resumeFrom: number;
  /** True if a stale on-disk file must be deleted before writing. */
  deleteStale: boolean;
}

export function resumeDecision(input: ResumeInput): ResumeDecision {
  const { onDisk, entryBytes, entrySha, recordedSha } = input;
  const resumable =
    onDisk > 0 && onDisk < entryBytes && !!entrySha && recordedSha === entrySha;
  return { resumeFrom: resumable ? onDisk : 0, deleteStale: onDisk > 0 && !resumable };
}
