// Streaming SHA-256 (FIPS 180-4).
//
// WebCrypto's `crypto.subtle.digest` is one-shot: it needs the whole input in
// memory at once. For large downloaded archives (hundreds of MB) that forces a
// full-file read — on device via Capacitor Filesystem.readFile that means a
// base64 copy of the entire file and an out-of-memory crash. This incremental
// hasher lets us feed the file in bounded chunks (see verifyArchive) and never
// hold more than one chunk at a time.
//
// Verified byte-for-byte against Node's crypto across block-boundary and
// multi-MB sizes.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0; // total bytes fed
  private w = new Uint32Array(64);

  update(data: Uint8Array): this {
    this.total += data.length;
    let off = 0;
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      off = take;
      if (this.bufLen === 64) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    while (off + 64 <= data.length) {
      this.block(data, off);
      off += 64;
    }
    if (off < data.length) {
      this.buf.set(data.subarray(off), this.bufLen);
      this.bufLen += data.length - off;
    }
    return this;
  }

  private block(p: Uint8Array, off: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    const hh = this.h;
    let a = hh[0], b = hh[1], c = hh[2], d = hh[3], e = hh[4], f = hh[5], g = hh[6], h = hh[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    hh[0] = (hh[0] + a) | 0; hh[1] = (hh[1] + b) | 0; hh[2] = (hh[2] + c) | 0; hh[3] = (hh[3] + d) | 0;
    hh[4] = (hh[4] + e) | 0; hh[5] = (hh[5] + f) | 0; hh[6] = (hh[6] + g) | 0; hh[7] = (hh[7] + h) | 0;
  }

  /** Finalize and return the lowercase hex digest. Call once. */
  hex(): string {
    const bitLen = this.total * 8;
    const rem = (this.bufLen + 1) % 64;
    const zeros = rem <= 56 ? 56 - rem : 120 - rem;
    const pad = new Uint8Array(1 + zeros + 8);
    pad[0] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    const o = 1 + zeros;
    pad[o] = (hi >>> 24) & 0xff; pad[o + 1] = (hi >>> 16) & 0xff;
    pad[o + 2] = (hi >>> 8) & 0xff; pad[o + 3] = hi & 0xff;
    pad[o + 4] = (lo >>> 24) & 0xff; pad[o + 5] = (lo >>> 16) & 0xff;
    pad[o + 6] = (lo >>> 8) & 0xff; pad[o + 7] = lo & 0xff;
    this.update(pad);
    return [...this.h].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
}
