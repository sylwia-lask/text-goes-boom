function hash11(x: number): number {
  return ((Math.sin(x * 12.9898) * 43758.5453) % 1 + 1) % 1;
}

const SPRING = 12.0;
const DAMP   = 0.92;
const NOISE  = 1.5;
const PARTICLE_SIZE_PX = 3.0;

const HOT_PINK = [1.00, 0.20, 0.78] as const;
const VIOLET   = [0.55, 0.30, 1.00] as const;
const INDIGO   = [0.28, 0.10, 0.80] as const;

function saturate(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const u = saturate(t);
  if (u < 0.5) {
    const k = u * 2.0;
    return [
      mix(a[0], b[0], k),
      mix(a[1], b[1], k),
      mix(a[2], b[2], k),
    ];
  }

  const k = (u - 0.5) * 2.0;
  return [
    mix(b[0], c[0], k),
    mix(b[1], c[1], k),
    mix(b[2], c[2], k),
  ];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hashU32(x0: number): number {
  let x = x0 >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

function hash01(x: number): number {
  const h = hashU32(x);
  return (h & 0x00ff_ffff) / 16777216.0;
}

export class Canvas2DRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private posX  = new Float32Array(0);
  private posY  = new Float32Array(0);
  private velX  = new Float32Array(0);
  private velY  = new Float32Array(0);
  private homeX = new Float32Array(0);
  private homeY = new Float32Array(0);
  private seed  = new Float32Array(0);
  private sdf   = new Float32Array(0);
  private n = 0;

  private accumRgb = new Float32Array(0);
  private imageData: ImageData | null = null;

  private mouse            = { x: 0, y: 0, down: false };
  private time             = 0;
  private lastT            = 0;

  private fpsHistory: number[] = [];
  private _fps = 0;
  get fps() { return this._fps; }

  private rafId = 0;
  private frameCallback: FrameRequestCallback = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext("2d")!;
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp   = this.onPointerUp.bind(this);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup",   this.onPointerUp);
  }

  setParticles(packed: Float32Array) {
    const n = packed.length / 8;
    this.n    = n;
    this.posX  = new Float32Array(n);
    this.posY  = new Float32Array(n);
    this.velX  = new Float32Array(n);
    this.velY  = new Float32Array(n);
    this.homeX = new Float32Array(n);
    this.homeY = new Float32Array(n);
    this.seed  = new Float32Array(n);
    this.sdf   = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const b = i * 8;
      this.posX [i] = packed[b];
      this.posY [i] = packed[b + 1];
      this.velX [i] = packed[b + 2];
      this.velY [i] = packed[b + 3];
      this.homeX[i] = packed[b + 4];
      this.homeY [i] = packed[b + 5];
      this.seed  [i] = packed[b + 6];
      this.sdf   [i] = packed[b + 7];
    }
  }

  start() {
    this.lastT = performance.now();
    this.frameCallback = () => {
      const now    = performance.now();
      const wallDt = (now - this.lastT) / 1000;
      this.lastT   = now;
      const dt = Math.min(wallDt, 1 / 30);
      this.time += dt;

      this.fpsHistory.push(1 / wallDt);
      if (this.fpsHistory.length > 30) this.fpsHistory.shift();
      this._fps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
      this.tick(dt);

      this.resize();
      this.draw();

      this.rafId = requestAnimationFrame(this.frameCallback);
    };
    this.rafId = requestAnimationFrame(this.frameCallback);
  }

  pause() {
    cancelAnimationFrame(this.rafId);
  }

  resume() {
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.frameCallback);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private tick(dt: number) {
    const { n, mouse: { x: mx, y: my, down: md }, time: t } = this;

    for (let i = 0; i < n; i++) {
      let px = this.posX[i];
      let py = this.posY[i];
      let vx = this.velX[i];
      let vy = this.velY[i];
      const s = this.seed[i];

      let ax = (this.homeX[i] - px) * SPRING;
      let ay = (this.homeY[i] - py) * SPRING;

      const scale = 2.0 + s * 3.0;
      const noiseScale = Math.sqrt(1.0 / (dt * 60.0));
      ax += (hash11(px * scale * 10.0 + py * scale * 57.0 + t)        - 0.5) * NOISE * noiseScale;
      ay += (hash11(px * scale * 99.0 + py * scale * 13.0 + t * 0.73) - 0.5) * NOISE * noiseScale;

      if (md) {
        const dx    = px - mx;
        const dy    = py - my;
        const dist2 = Math.max(dx * dx + dy * dy, 0.0005);
        const d     = Math.sqrt(dist2);
        ax += (dx / d) * (0.05 / dist2);
        ay += (dy / d) * (0.05 / dist2);
      }

      const damp = Math.pow(DAMP, dt * 60);
      vx = vx * damp + ax * dt;
      vy = vy * damp + ay * dt;
      px += vx * dt;
      py += vy * dt;

      if (px < -1.1) { px = -1.1; vx *= -0.4; }
      if (px >  1.1) { px =  1.1; vx *= -0.4; }
      if (py < -1.1) { py = -1.1; vy *= -0.4; }
      if (py >  1.1) { py =  1.1; vy *= -0.4; }

      this.posX[i] = px;
      this.posY[i] = py;
      this.velX[i] = vx;
      this.velY[i] = vy;
    }
  }

  private draw() {
    const { canvas, ctx } = this;
    const w  = canvas.width;
    const h  = canvas.height;
    const hw = w / 2;
    const hh = h / 2;
    const soft = PARTICLE_SIZE_PX <= 2.5 ? 0.55 : 0.60;
    const sampleRadius = Math.ceil(PARTICLE_SIZE_PX * soft);

    this.ensureFrameBuffers(w, h);

    const accum = this.accumRgb;
    accum.fill(0);

    for (let i = 0; i < this.n; i++) {
      const sx = (this.posX[i] + 1) * hw;
      const sy = (1 - this.posY[i]) * hh;

      const rnd = hash01(i);
      const shimmer = 0.08 * Math.sin(this.time * 1.1 + rnd * Math.PI * 2);
      const sdf_t = saturate(this.sdf[i] + shimmer);
      const base = mix3(HOT_PINK, VIOLET, INDIGO, sdf_t);

      const brightness = mix(1.15, 0.75, saturate(this.sdf[i]));
      const pulse = brightness + 0.5 * Math.sin(this.time * 0.7 + rnd * 8.0);

      const minX = Math.max(0, Math.floor(sx - sampleRadius));
      const maxX = Math.min(w - 1, Math.ceil(sx + sampleRadius));
      const minY = Math.max(0, Math.floor(sy - sampleRadius));
      const maxY = Math.min(h - 1, Math.ceil(sy + sampleRadius));

      for (let py = minY; py <= maxY; py++) {
        const dy = (py + 0.5) - sy;

        for (let px = minX; px <= maxX; px++) {
          const dx = (px + 0.5) - sx;
          const d = Math.hypot(dx, dy) / PARTICLE_SIZE_PX;
          const alpha = smoothstep(soft, 0.0, d);
          if (alpha <= 0) continue;

          const glow = alpha * alpha * pulse;
          const scale = 0.30 + 1.30 * glow;
          const idx = (py * w + px) * 3;

          accum[idx]     += base[0] * scale * alpha;
          accum[idx + 1] += base[1] * scale * alpha;
          accum[idx + 2] += base[2] * scale * alpha;
        }
      }
    }

    const image = this.imageData!;
    const pixels = image.data;
    const pixelCount = w * h;

    for (let i = 0; i < pixelCount; i++) {
      const src = i * 3;
      const dst = i * 4;
      pixels[dst]     = Math.min(255, Math.round(accum[src] * 255));
      pixels[dst + 1] = Math.min(255, Math.round(accum[src + 1] * 255));
      pixels[dst + 2] = Math.min(255, Math.round(accum[src + 2] * 255));
      pixels[dst + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
  }

  private ensureFrameBuffers(w: number, h: number) {
    const rgbSize = w * h * 3;
    if (this.accumRgb.length !== rgbSize) {
      this.accumRgb = new Float32Array(rgbSize);
    }

    if (!this.imageData || this.imageData.width !== w || this.imageData.height !== h) {
      this.imageData = this.ctx.createImageData(w, h);
    }
  }

  private resize() {
    const dpr  = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w    = Math.max(1, Math.floor(rect.width  * dpr));
    const h    = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
    }
  }

  private onPointerMove(e: PointerEvent) {
    const rect   = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this.mouse.y = 1 - ((e.clientY - rect.top) / rect.height) * 2;
  }

  private onPointerDown() { this.mouse.down = true;  }
  private onPointerUp()   { this.mouse.down = false; }
}
