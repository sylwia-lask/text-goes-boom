import { useEffect, useMemo, useRef, useState } from "react";
import { ensureWasmReady, particlesFromImageData } from "./wasm";
import { rasterizeTextToImageData } from "./text/resizeText";
import { TextBoomRenderer } from "./gpu/renderer";

export default function TextGoesBoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<TextBoomRenderer | null>(null);

  const [text, setText] = useState("TEXT GOES BOOM");
  const [step, setStep] = useState(2);
  const [size, setSize] = useState(140);

  const [particleCount, setParticleCount] = useState(0);
  const [status, setStatus] = useState<"boot" | "ready" | "error">("boot");
  const [error, setError] = useState<string>("");

  const fontFamily = useMemo(
    () => "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    [],
  );

  const rebuildParticles = () => {
    const r = rendererRef.current;
    if (!r) return;

    const img = rasterizeTextToImageData({
      text,
      fontFamily,
      fontWeight: "900",
      fontSizePx: size,
      paddingPx: 64,
    });

    const packed = particlesFromImageData(img, step, 10);
    setParticleCount(packed.length / 8);
    r.setParticles(packed);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatus("boot");
        setError("");

        await ensureWasmReady();
        if (!alive) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const r = new TextBoomRenderer({ canvas, particleSizePx: 3 });
        await r.init();
        rendererRef.current = r;

        r.start();

        const fontsAny = document.fonts as unknown as { ready?: Promise<void> } | undefined;
        if (fontsAny?.ready) {
          await fontsAny.ready;
        }

        if (!alive) return;

        requestAnimationFrame(() => {
          if (!alive) return;
          rebuildParticles();
          setStatus("ready");
        });
      } catch (e) {
        if (!alive) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive = false;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#05030a] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="absolute top-24 -right-56 h-[560px] w-[560px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-52 left-1/3 h-[700px] w-[700px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]" />
        <div className="absolute inset-0 opacity-35 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        <header className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-md">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
            WASM + WebGPU · compute-driven particles
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Text{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
              Goes Boom
            </span>
          </h1>

          <p className="max-w-2xl text-sm sm:text-base text-white/70">
            Type a phrase, rebuild the particles, then click and drag to blow the text apart.
          </p>
        </header>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
          <section className="order-2 lg:order-1 rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md shadow-[0_30px_120px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="p-5 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
              <h2 className="text-lg font-bold">Controls</h2>
              <p className="text-sm text-white/60 mt-1">
                Rebuild to re-sample the text mask. Lower step = more particles.
              </p>
            </div>

            <div className="p-5 flex flex-col gap-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-white/85">Text</label>
                  <span className="text-xs text-white/50">Enter / Rebuild</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rebuildParticles();
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 text-white outline-none border border-white/10 focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/20 placeholder-white/40"
                    placeholder="Type something iconic…"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={rebuildParticles}
                    className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-4 py-2 font-bold text-black shadow-[0_12px_36px_rgba(217,70,239,0.25)] hover:brightness-110 active:brightness-95"
                  >
                    Rebuild particles
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/85">Density</div>
                  <div className="text-xs tabular-nums text-white/60">step={step}</div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={step}
                  onChange={(e) => setStep(parseInt(e.target.value, 10))}
                  className="mt-3 w-full accent-fuchsia-400"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/85">Font size</div>
                  <div className="text-xs tabular-nums text-white/60">{size}px</div>
                </div>
                <input
                  type="range"
                  min={60}
                  max={220}
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value, 10))}
                  className="mt-3 w-full accent-cyan-300"
                />
              </div>

              <button
                onClick={rebuildParticles}
                className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white font-semibold px-4 py-3"
              >
                Apply sliders
              </button>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <div className="relative h-[62vh] min-h-[520px] rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md shadow-[0_30px_140px_rgba(0,0,0,0.65)] overflow-hidden">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

              <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.8)]" />
                    <div>
                      <div className="text-sm font-semibold">
                        GPU simulation <span className="text-white/60 font-medium">· compute + instancing</span>
                      </div>
                      <div className="text-xs text-white/55">
                        {status === "boot" && "Booting…"}
                        {status === "ready" && "Click/drag inside the canvas"}
                        {status === "error" && "Error"}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 text-xs text-white/55">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      particles <span className="text-white/80 tabular-nums">{particleCount}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      step <span className="text-white/80 tabular-nums">{step}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      size <span className="text-white/80 tabular-nums">{size}</span>
                    </span>
                  </div>
                </div>
              </div>

              {status === "error" && (
                <div className="absolute inset-x-0 top-20 p-4">
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 backdrop-blur-md px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md p-4">
                <div className="text-xs text-white/55">Stage</div>
                <div className="mt-1 font-bold">Data prep</div>
                <div className="mt-1 text-sm text-white/65">
                  Canvas text mask → WASM samples pixels into particle buffers.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md p-4">
                <div className="text-xs text-white/55">Stage</div>
                <div className="mt-1 font-bold">Simulation</div>
                <div className="mt-1 text-sm text-white/65">
                  Compute shader updates positions with spring + noise + mouse force.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md p-4">
                <div className="text-xs text-white/55">Stage</div>
                <div className="mt-1 font-bold">Render</div>
                <div className="mt-1 text-sm text-white/65">
                  Instanced quads with additive blending for that neon pop.
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-white/45">
          <div>
            <span className="text-white/60 font-semibold">Text Goes Boom</span> · WebGPU + WASM demo
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Click/drag to explode</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Rebuild after changes</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
