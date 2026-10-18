# Text Goes Boom

**Live demo → [sylwia-lask.github.io/text-goes-boom](https://sylwia-lask.github.io/text-goes-boom/)**

A WebGPU + WebAssembly particle demo. Type any phrase, press *Rebuild*, then click and drag to explode the text.

## What it does

Particles are placed inside the typed glyphs and spring back to their home positions. Every frame each particle is updated **independently** — a spring pulls it home, per-particle noise gives it a unique wobble, and pointer-down adds a radial repulsion force. The even spread of particles comes from a one-time relaxation pass during placement (Stage 1), not from per-frame particle-to-particle interaction.

The simulation can run two ways so you can compare them side by side:

- **WebGPU** (preferred) — a WGSL compute shader updates every particle in parallel, then an instanced draw renders them.
- **Canvas 2D** (fallback) — the identical physics runs in a single-threaded JS loop and particles are drawn on a 2D canvas. If WebGPU is unavailable or the GPU device is lost, the app automatically switches to this renderer and the WebGPU tab is marked unavailable.

## How it works — three stages

### Stage 1 · Rust / WASM — SDF & placement

When you hit *Rebuild*, a Canvas 2D renders the text to a pixel buffer. That buffer is handed to a **Rust module compiled to WASM** which runs:

1. **Felzenszwalb–Huttenlocher exact EDT** — O(w·h) separable 1-D parabola algorithm that produces a signed-distance field for the glyph interior. Values range from 0 (on the edge) to 1 (deepest interior).
2. **Uniform grid sampling** — every interior grid point (step × step cell) spawns a particle with a small random jitter within the cell. At step = 1 this yields one particle per interior pixel — around 200k for "TEXT GOES BOOM" at font 180px.
3. **Spatial-grid relaxation** — 4 iterations of neighbourhood repulsion push particles apart while keeping every particle inside the mask. This is the only particle-to-particle interaction in the whole app; it runs once at placement time, not per frame. At step = 1 density the grid placement is already tight, so 4 iterations is enough and keeps rebuild fast.

The same algorithm is re-implemented in TypeScript in [`src/benchmark.ts`](src/benchmark.ts) so the rebuild panel can show a live WASM vs JS timing comparison (see [JS vs WASM benchmark](#js-vs-wasm-benchmark)).

### Stage 2 · Per-particle spring + noise physics

[`src/gpu/shaders/textBoom.compute.wgsl`](src/gpu/shaders/textBoom.compute.wgsl) (WebGPU) · [`src/canvas2dRenderer.ts`](src/canvas2dRenderer.ts) (Canvas 2D)

Each frame every particle is advanced **independently** of its neighbours, so the physics is O(n). On WebGPU a compute pass dispatches one workgroup per 256 particles; on Canvas 2D the same update runs in a plain JS loop.

- **Spring** — each particle is pulled toward its home position (`SPRING = 12`).
- **Noise turbulence** — a position-and-time-based `hash11` gives each particle a unique wobble frequency (scaled by its `seed` value) so the crowd doesn't move in lock-step.
- **Mouse** — pointer-down applies a radial repulsion force.

> This is **not** an N-body simulation — particles do not read each other's positions during the per-frame update. The even spacing you see comes from the one-time Stage 1 relaxation.

### Stage 3 · WGSL render shader — instanced draw

[`src/gpu/shaders/textBoom.render.wgsl`](src/gpu/shaders/textBoom.render.wgsl)

A single `draw(6, particleCount)` call renders all particles as instanced quads.

- The SDF value stored per particle drives a colour gradient: **hot pink** (edge) → **fuchsia** → **violet** → **indigo** (interior).
- **Additive blending** (`srcFactor: "src-alpha", dstFactor: "one"`) gives the neon glow from overlapping particles.

## Two separate comparisons

The app exposes two independent comparisons. They measure **different workloads** and are not a single three-way benchmark:

1. **JS vs WASM — particle generation.** How long the Stage 1 SDF + sampling + relaxation pipeline takes to *prepare* the particle set, in Rust-compiled WASM versus a line-for-line TypeScript port. Shown in the rebuild panel in milliseconds. This is a one-shot setup cost paid on *Rebuild*.
2. **Canvas 2D vs WebGPU — simulation + rendering.** How many frames per second the *per-frame* physics update and draw sustain, on the CPU (Canvas 2D) versus the GPU (WebGPU). Shown as the live FPS counter; switch tabs to compare.

### JS vs WASM benchmark

The rebuild panel shows how long the SDF + relaxation pipeline takes in WASM versus a line-for-line JS port. Both implementations are deliberately kept in sync:

| Detail | WASM (Rust) | JS (TypeScript) |
|---|---|---|
| EDT | `sdf.rs` — `dt1d` / `compute_sdf` | `benchmark.ts` — `dt1d` / `computeSdf` |
| RNG | `rng.rs` — LCG seed `0xA3C51F2D` | `benchmark.ts` — `class Lcg`, same seed |
| Relaxation | `relax.rs` — `relax_inside`, strength 0.40 | `benchmark.ts` — `relaxInside`, same |
| Iterations | 4 | 4 |

Both paths run on the identical input image and settings. To keep the numbers fair without over-engineering it, [`runBenchmark`](src/benchmark.ts) warms up each path once (untimed) and reports the **median of a few timed runs**. The WASM figure includes copying the result out of WASM memory into a JS `Float32Array`, which is the real cost of using WASM for this step.

## Tech stack

| | |
|---|---|
| Rendering | WebGPU (compute + render pipeline), with a Canvas 2D fallback |
| Per-frame physics | WGSL compute shader (WebGPU) / JS loop (Canvas 2D) — independent per-particle spring + noise + mouse force, O(n) |
| Particle placement | Rust → WASM via wasm-pack / wasm-bindgen (SDF + relaxation), with a TypeScript port for the benchmark |
| UI | React 19 + Tailwind CSS v4 |
| Bundler | Vite 7 |

## Architecture

Responsibilities are split so that the simulation never touches React's render cycle:

- **React components & state** — control panel (text, density, font size), renderer tab selection, and periodic metrics (FPS, particle count, benchmark timings polled every ~500 ms). React does **not** store per-particle data or update state per frame. There are no Web Workers and no custom hooks.
- **`<canvas>` elements** — one for WebGPU, one for Canvas 2D; React only mounts them and toggles visibility.
- **Rust / WebAssembly** (`wasm/`) — builds the glyph inside-mask, computes the SDF, samples particles, and runs the relaxation pass. Returns a packed `Float32Array`.
- **JavaScript particle generation** (`src/benchmark.ts`) — a port of the Rust pipeline used solely for the WASM-vs-JS timing comparison.
- **WebGPU compute shader** (`textBoom.compute.wgsl`) — advances every particle in parallel each frame.
- **WebGPU render shader** (`textBoom.render.wgsl`) — one instanced draw call for all particles.
- **`TextBoomRenderer` / `Canvas2DRenderer`** — own the animation loop and all per-frame state outside React. Both consume the same packed particle layout, so switching renderers or rebuilding particles keeps them in sync.

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
