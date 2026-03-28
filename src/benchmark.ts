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

// ── Spatial-grid relaxation ───────────────────────────────────────────────────

function relaxInside(
  px: Float32Array,
  py: Float32Array,
  w: number,
  h: number,
  inside: Uint8Array,
  radiusPx: number,
  iters: number,
): void {
  const n = px.length;
  if (n === 0) return;

  const r = Math.max(radiusPx, 1);
  const r2 = r * r;
  const cell = r;
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const gridSize = cols * rows;

  // grid[k] = array of particle indices in that cell
  const grid: number[][] = Array.from({ length: gridSize }, () => []);
  const dx = new Float32Array(n);
  const dy = new Float32Array(n);

  for (let iter = 0; iter < iters; iter++) {
    for (let k = 0; k < gridSize; k++) grid[k].length = 0;

    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(px[i] / cell)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(py[i] / cell)));
      grid[cy * cols + cx].push(i);
    }

    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] / cell);
      const cy = Math.floor(py[i] / cell);

      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          if (nx < 0 || nx >= cols) continue;
          const bucket = grid[ny * cols + nx];
          for (let bi = 0; bi < bucket.length; bi++) {
            const j = bucket[bi];
            if (j === i) continue;
            const vx = px[i] - px[j];
            const vy = py[i] - py[j];
            const d2 = vx * vx + vy * vy;
            if (d2 <= 1e-6 || d2 >= r2) continue;
            const d = Math.sqrt(d2);
            const push = (r - d) / r;
            dx[i] += (vx / d) * push;
            dy[i] += (vy / d) * push;
          }
        }
      }
    }

    const strength = 0.4;
    for (let i = 0; i < n; i++) {
      const nx = Math.min(w - 0.5, Math.max(0.5, px[i] + dx[i] * strength));
      const ny = Math.min(h - 0.5, Math.max(0.5, py[i] + dy[i] * strength));
      const ix = Math.min(w - 1, nx | 0);
      const iy = Math.min(h - 1, ny | 0);
      if (inside[iy * w + ix] === 1) {
        px[i] = nx;
        py[i] = ny;
      }
    }
  }
}

// ── LCG matching the Rust implementation ─────────────────────────────────────

class Lcg {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  nextU32(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }
  nextF32(): number {
    const v = (this.nextU32() >>> 8) & 0x00ff_ffff;
    return v / 16777216;
  }
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

  // Stage 2: grid sampling
  const pxArr: number[] = [];
  const pyArr: number[] = [];

  for (let y = half; y < h; y += step) {
    for (let x = half; x < w; x += step) {
      const i = y * w + x;
      if (inside[i] === 0) continue;

      const jx = (rng.nextF32() - 0.5) * step * 0.85;
      const jy = (rng.nextF32() - 0.5) * step * 0.85;
      pxArr.push(Math.min(Math.max(x + 0.5 + jx, 0.5), w - 0.5));
      pyArr.push(Math.min(Math.max(y + 0.5 + jy, 0.5), h - 0.5));
    }
  }

  // Stage 3: relaxation — same 4 iterations as WASM
  const pxF = new Float32Array(pxArr);
  const pyF = new Float32Array(pyArr);
  relaxInside(pxF, pyF, w, h, inside, Math.max(2, step * 1.3 + 1.5), 4);

  // Stage 4: pack into GPU layout
  const count = pxF.length;
  const out = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const ix = Math.min(w - 1, pxF[i] | 0);
    const iy = Math.min(h - 1, pyF[i] | 0);
    const sdfVal = inside[iy * w + ix] === 1 ? sdf[iy * w + ix] : 0;
    const cx = (pxF[i] / w) * 2 - 1;
    const cy = 1 - (pyF[i] / h) * 2;
    const seed = rng.nextF32();
    const b = i * 8;
    out[b] = cx; out[b+1] = cy; out[b+2] = 0; out[b+3] = 0;
    out[b+4] = cx; out[b+5] = cy; out[b+6] = seed; out[b+7] = sdfVal;
  }
  return out;
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
