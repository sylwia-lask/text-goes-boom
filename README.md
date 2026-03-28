# Text Goes Boom

**Live demo → [sylwia-lask.github.io/text-goes-boom](https://sylwia-lask.github.io/text-goes-boom/)**

A WebGPU + WebAssembly particle demo. Type any phrase, press *Rebuild*, then click and drag to explode the text.

![screenshot](docs/screenshot.png)

## What it does

Particles are placed inside the typed glyphs and spring back to their home positions. Every frame, a WebGPU compute shader runs an N-body repulsion between all particles so they spread out naturally rather than piling on top of each other.

## How it works — three stages

### Stage 1 · Rust / WASM — SDF & placement

When you hit *Rebuild*, a Canvas 2D renders the text to a pixel buffer. That buffer is handed to a **Rust module compiled to WASM** which runs:

1. **Felzenszwalb–Huttenlocher exact EDT** — O(w·h) separable 1-D parabola algorithm that produces a signed-distance field for the glyph interior. Values range from 0 (on the edge) to 1 (deepest interior).
2. **Uniform grid sampling** — every interior grid point (step × step cell) spawns a particle with a small random jitter within the cell. At step = 1 this yields one particle per interior pixel — around 200k for "TEXT GOES BOOM" at font 180px.
3. **Spatial-grid relaxation** — 4 iterations of neighbourhood repulsion push particles apart while keeping every particle inside the mask. At step = 1 density the grid placement is already tight, so 4 iterations is enough and keeps rebuild fast.

The same algorithm is re-implemented in TypeScript in [`src/benchmark.ts`](src/benchmark.ts) so the rebuild panel can show a live WASM vs JS timing comparison.

### Stage 2 · WGSL compute shader — spring + noise physics

[`src/gpu/shaders/textBoom.compute.wgsl`](src/gpu/shaders/textBoom.compute.wgsl)

Each frame a compute pass dispatches one workgroup per 256 particles. Physics is O(n) so it scales to 200k particles with ease.

- **Spring** — each particle is pulled toward its home position (`SPRING = 12`).
- **Noise turbulence** — position-and-time-based `hash11` gives each particle a unique wobble frequency (scaled by its `seed` value) so the crowd doesn't move in lock-step.
- **Mouse** — pointer-down applies a radial repulsion force.

### Stage 3 · WGSL render shader — instanced draw

[`src/gpu/shaders/textBoom.render.wgsl`](src/gpu/shaders/textBoom.render.wgsl)

A single `draw(6, particleCount)` call renders all particles as instanced quads.

- The SDF value stored per particle drives a colour gradient: **hot pink** (edge) → **fuchsia** → **violet** → **indigo** (interior).
- **Additive blending** (`srcFactor: "src-alpha", dstFactor: "one"`) gives the neon glow from overlapping particles.

## JS vs WASM benchmark

The rebuild panel shows how long the SDF + relaxation pipeline takes in WASM versus a line-for-line JS port. Both implementations are deliberately kept in sync:

| Detail | WASM (Rust) | JS (TypeScript) |
|---|---|---|
| EDT | `sdf.rs` — `dt1d` / `compute_sdf` | `benchmark.ts` — `dt1d` / `computeSdf` |
| RNG | `rng.rs` — LCG seed `0xA3C51F2D` | `benchmark.ts` — `class Lcg`, same seed |
| Relaxation | `relax.rs` — `relax_inside`, strength 0.40 | `benchmark.ts` — `relaxInside`, same |
| Iterations | 12 | 12 |

## Tech stack

| | |
|---|---|
| Rendering | WebGPU (compute + render pipeline) |
| Physics | WGSL compute shader — N-body, tiled shared memory |
| Particle placement | Rust → WASM via wasm-pack / wasm-bindgen |
| UI | React 19 + Tailwind CSS v4 |
| Bundler | Vite 7 |

## Local development

```bash
# Install Rust toolchain (if needed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack (if needed)
cargo install wasm-pack

# Build WASM + start dev server
npm run dev:all
```

Requires a browser with WebGPU support (Chrome 113+ / Edge 113+).

## Build for production

```bash
npm run wasm:build   # compile Rust → src/wasm-pkg/
npm run build        # TypeScript + Vite → dist/
```

## Deployment

GitHub Actions builds and deploys to GitHub Pages on every push to `main`. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
