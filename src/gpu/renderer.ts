import computeCode from "./shaders/textBoom.compute.wgsl?raw";
import renderCode from "./shaders/textBoom.render.wgsl?raw";

type TextBoomRendererOptions = {
  canvas: HTMLCanvasElement;
  particleSizePx?: number; // 2..6
};

type GPUBuffers = {
  particlesA: GPUBuffer;
  particlesB: GPUBuffer;
  quad: GPUBuffer;
  simUniform: GPUBuffer;
  renderUniform: GPUBuffer;
};

const FLOATS_PER_PARTICLE = 8;

export class TextBoomRenderer {
  private canvas: HTMLCanvasElement;
  private particleSizePx: number;

  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private computePipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;

  private buffers!: GPUBuffers;

  private bindCompute: GPUBindGroup | null = null;
  private bindRender: GPUBindGroup | null = null;

  private particleCount = 0;

  private lastT = 0;
  private time = 0;

  private mouse = { x: 0, y: 0, down: false };

  constructor(opts: TextBoomRendererOptions) {
    this.canvas = opts.canvas;
    this.particleSizePx = opts.particleSizePx ?? 3.0;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  async init() {
    if (!navigator.gpu) throw new Error("WebGPU not supported in this browser");

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPU adapter");

    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({ code: computeCode }),
        entryPoint: "main",
      },
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({ code: renderCode }),
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 4 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: renderCode }),
        entryPoint: "fs_main",
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });

    this.installPointerHandlers();

    const quadData = new Float32Array([
      // corner.xy  uv.xy
      -0.5, -0.5, 0.0, 0.0,
       0.5, -0.5, 1.0, 0.0,
       0.5,  0.5, 1.0, 1.0,

      -0.5, -0.5, 0.0, 0.0,
       0.5,  0.5, 1.0, 1.0,
      -0.5,  0.5, 0.0, 1.0,
    ]);

    const quad = this.device.createBuffer({
      size: quadData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(quad.getMappedRange()).set(quadData);
    quad.unmap();

    const simUniform = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const renderUniform = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const particlesA = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const particlesB = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.buffers = { particlesA, particlesB, quad, simUniform, renderUniform };
  }

  setParticles(packed: Float32Array) {
    if (packed.length % FLOATS_PER_PARTICLE !== 0) {
      throw new Error(`Packed particle array must be multiple of ${FLOATS_PER_PARTICLE} floats`);
    }

    this.particleCount = packed.length / FLOATS_PER_PARTICLE;

    const a = new Float32Array(this.particleCount * 4);
    const b = new Float32Array(this.particleCount * 4);

    for (let i = 0; i < this.particleCount; i++) {
      const base = i * 8;
      a.set(packed.subarray(base, base + 4), i * 4);
      b.set(packed.subarray(base + 4, base + 8), i * 4);
    }

    this.buffers.particlesA.destroy();
    this.buffers.particlesB.destroy();

    this.buffers.particlesA = this.device.createBuffer({
      size: Math.max(16, a.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.buffers.particlesB = this.device.createBuffer({
      size: Math.max(16, b.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.buffers.particlesA, 0, a);
    this.device.queue.writeBuffer(this.buffers.particlesB, 0, b);

    this.rebuildBindGroups();
  }

  start() {
    this.lastT = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - this.lastT) / 1000, 1 / 30);
      this.lastT = now;
      this.time += dt;

      this.resizeCanvasToDisplaySize();

      this.updateUniforms(dt);
      this.tick();

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private rebuildBindGroups() {
    // Compute bind group
    this.bindCompute = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.particlesA } },
        { binding: 1, resource: { buffer: this.buffers.particlesB } },
        { binding: 2, resource: { buffer: this.buffers.simUniform } },
      ],
    });

    // Render bind group
    this.bindRender = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.particlesA } },
        { binding: 1, resource: { buffer: this.buffers.renderUniform } },
      ],
    });
  }

  private updateUniforms(dt: number) {
    // Sim uniforms (32 bytes)
    const sim = new ArrayBuffer(32);
    const f32 = new Float32Array(sim);
    const u32 = new Uint32Array(sim);

    f32[0] = dt;
    f32[1] = this.time;
    f32[2] = this.mouse.x;
    f32[3] = this.mouse.y;
    u32[4] = this.mouse.down ? 1 : 0;

    this.device.queue.writeBuffer(this.buffers.simUniform, 0, sim);

    // Render uniforms (16 bytes)
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);

    const render = new ArrayBuffer(16);
    const rf = new Float32Array(render);
    rf[0] = w;
    rf[1] = h;
    rf[2] = this.particleSizePx;
    rf[3] = this.time;

    this.device.queue.writeBuffer(this.buffers.renderUniform, 0, render);
  }

  private tick() {
    if (this.particleCount === 0) return;
    if (!this.bindCompute || !this.bindRender) return;

    const encoder = this.device.createCommandEncoder();

    // Compute pass
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, this.bindCompute);

      const workgroupSize = 256;
      const numGroups = Math.ceil(this.particleCount / workgroupSize);
      pass.dispatchWorkgroups(numGroups);
      pass.end();
    }

    // Render pass
    {
      const view = this.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });

      pass.setPipeline(this.renderPipeline);
      pass.setBindGroup(0, this.bindRender);
      pass.setVertexBuffer(0, this.buffers.quad);

      pass.draw(6, this.particleCount);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  private resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private installPointerHandlers() {
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  destroy() {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private onPointerMove(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    const y = (e.clientY - rect.top) / rect.height; // 0..1
    this.mouse.x = x * 2 - 1;
    this.mouse.y = 1 - y * 2;
  }

  private onPointerDown() {
    this.mouse.down = true;
  }

  private onPointerUp() {
    this.mouse.down = false;
  }
}
