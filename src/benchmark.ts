/**
 * Pure-JS implementation of the same SDF + particle-sampling pipeline
 * that runs inside WASM.  Used only for the benchmark comparison.
 */

// ── 1-D squared EDT (Felzenszwalb-Huttenlocher) ──────────────────────────────

function dt1d(f: Float32Array): Float32Array {
  const n = f.length;
  const d = new Float32Array(n).fill(Infinity);
  if (n === 0) return d;

  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  let k = -1;

  for (let q = 0; q < n; q++) {
    const fq = f[q];
    if (fq === Infinity) continue;

    for (;;) {
      if (k < 0) {
        k = 0;
        v[0] = q;
        z[0] = -Infinity;
        z[1] = Infinity;
        break;
      }
      const r = v[k];
      const fr = f[r];
      const s = ((fq + q * q) - (fr + r * r)) / (2 * (q - r));
      if (s <= z[k]) {
        k--;
      } else {
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
        break;
      }
    }
  }

  if (k < 0) return d;

  let j = 0;
  for (let q = 0; q < n; q++) {
    while (j < k && z[j + 1] < q) j++;
    const r = v[j];
    const diff = q - r;
    d[q] = diff * diff + f[r];
  }

  return d;
}

// ── 2-D SDF ──────────────────────────────────────────────────────────────────

function computeSdf(w: number, h: number, inside: Uint8Array): Float32Array {
  const n = w * h;
  const tmp = new Float32Array(n);
  const rowBuf = new Float32Array(w);

  // Pass 1: EDT along X
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rowBuf[x] = inside[y * w + x] === 0 ? 0 : Infinity;
    }
    const d = dt1d(rowBuf);
    tmp.set(d, y * w);
  }

  // Pass 2: EDT along Y
  const dist2 = new Float32Array(n);
  const colBuf = new Float32Array(h);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) colBuf[y] = tmp[y * w + x];
    const d = dt1d(colBuf);
    for (let y = 0; y < h; y++) dist2[y * w + x] = d[y];
  }

  // Normalize
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    if (inside[i] === 1 && dist2[i] > maxD) maxD = dist2[i];
  }
  maxD = Math.sqrt(maxD) || 1;

  const sdf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sdf[i] = inside[i] === 0 ? 0 : Math.min(Math.sqrt(dist2[i]) / maxD, 1);
  }
  return sdf;
}

// ── LCG matching the Rust implementation ─────────────────────────────────────

class Lcg {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  nextU32(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }
  nextF32(): number { return this.nextU32() / 4294967296; }
}

// ── Particle sampling (mirrors particles.rs) ─────────────────────────────────

function particlesJS(
  img: ImageData,
  step: number,
  alphaThreshold: number,
): Float32Array {
  const { width: w, height: h, data } = img;
  const n = w * h;

  // inside mask
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    inside[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0;
  }

  const sdf = computeSdf(w, h, inside);

  step = Math.max(1, step);
  const half = Math.max(1, step >> 1);
  const rng = new Lcg(0xa3c51f2d);
  const out: number[] = [];

  for (let y = half; y < h; y += step) {
    for (let x = half; x < w; x += step) {
      const i = y * w + x;
      if (inside[i] === 0) continue;

      const sdfHere = sdf[i];
      const prob = 1.0 - sdfHere * 0.75;
      if (rng.nextF32() > prob) continue;

      const jx = (rng.nextF32() - 0.5) * step * 0.85;
      const jy = (rng.nextF32() - 0.5) * step * 0.85;
      const fx = Math.min(Math.max(x + 0.5 + jx, 0.5), w - 0.5);
      const fy = Math.min(Math.max(y + 0.5 + jy, 0.5), h - 0.5);

      const ix = Math.min(fx | 0, w - 1);
      const iy = Math.min(fy | 0, h - 1);
      const sdfVal = inside[iy * w + ix] === 1 ? sdf[iy * w + ix] : sdfHere;

      const cx = (fx / w) * 2 - 1;
      const cy = 1 - (fy / h) * 2;
      const seed = rng.nextF32();

      out.push(cx, cy, 0, 0, cx, cy, seed, sdfVal);
    }
  }

  return new Float32Array(out);
}

// ── Public API ────────────────────────────────────────────────────────────────

export type BenchmarkResult = {
  wasmMs: number;
  jsMs: number;
  particles: Float32Array;
};

/**
 * Runs the WASM path and the JS path on the same image and returns
 * both timings and the WASM-produced particles (used for rendering).
 */
export function runBenchmark(
  img: ImageData,
  step: number,
  alphaThreshold: number,
  wasmFn: (img: ImageData, step: number, threshold: number) => Float32Array,
): BenchmarkResult {
  // JS first (no JIT advantage from running second)
  const jsT0 = performance.now();
  particlesJS(img, step, alphaThreshold);
  const jsMs = performance.now() - jsT0;

  // WASM
  const wasmT0 = performance.now();
  const particles = wasmFn(img, step, alphaThreshold);
  const wasmMs = performance.now() - wasmT0;

  return { wasmMs, jsMs, particles };
}
