import { useEffect, useMemo, useRef, useState } from "react";
import { ensureWasmReady, particlesFromImageData } from "./wasm";
import { rasterizeTextToImageData } from "./text/resizeText";
import { TextBoomRenderer } from "./gpu/renderer";
import { Canvas2DRenderer } from "./canvas2dRenderer";
import { runBenchmark } from "./benchmark";

type Tab = "gpu" | "cpu";

export default function TextGoesBoom() {
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuRef       = useRef<TextBoomRenderer | null>(null);
  const cpuRef       = useRef<Canvas2DRenderer | null>(null);

  const [tab,       setTab]       = useState<Tab>("gpu");
  const [switching, setSwitching] = useState(false);
  const [text, setText] = useState("TEXT GOES BOOM");
  const [step, setStep] = useState(1);
  const [size, setSize] = useState(180);

  const [particleCount, setParticleCount] = useState(0);
  const [status, setStatus] = useState<"boot" | "ready" | "error">("boot");
  const [error,  setError]  = useState("");
  const [bench,  setBench]  = useState<{ wasmMs: number; jsMs: number } | null>(null);
  const [gpuFps, setGpuFps] = useState(0);
  const [cpuFps, setCpuFps] = useState(0);

  const fontFamily = useMemo(
    () => "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    [],
  );

  const rebuildParticles = () => {
    if (!gpuRef.current) return;
    const img = rasterizeTextToImageData({
      text, fontFamily, fontWeight: "900", fontSizePx: size, paddingPx: 64,
    });
    const { particles, wasmMs, jsMs } = runBenchmark(img, step, 10, particlesFromImageData);
    setParticleCount(particles.length / 8);
    setBench({ wasmMs, jsMs });
    gpuRef.current.setParticles(particles);
    cpuRef.current?.setParticles(particles);
  };

  const switchTab = (t: Tab) => {
    if (t === tab || switching) return;
    setSwitching(true);
    if (t === "cpu") gpuRef.current?.pause();
    else cpuRef.current?.pause();
    requestAnimationFrame(() => {
      if (t === "cpu") cpuRef.current?.resume();
      else gpuRef.current?.resume();
      setTab(t);
      setSwitching(false);
    });
  };

  useEffect(() => {
    const id = setInterval(() => {
      setGpuFps(Math.round(gpuRef.current?.fps ?? 0));
      setCpuFps(Math.round(cpuRef.current?.fps ?? 0));
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatus("boot");
        setError("");
        await ensureWasmReady();
        if (!alive) return;

        const gpu = new TextBoomRenderer({ canvas: gpuCanvasRef.current!, particleSizePx: 3 });
        await gpu.init();
        gpuRef.current = gpu;
        gpu.start();

        const cpu = new Canvas2DRenderer(cpuCanvasRef.current!);
        cpuRef.current = cpu;
        cpu.start();
        cpu.pause();

        const fontsAny = document.fonts as unknown as { ready?: Promise<void> } | undefined;
        if (fontsAny?.ready) await fontsAny.ready;
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
      gpuRef.current?.destroy(); gpuRef.current = null;
      cpuRef.current?.destroy(); cpuRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFps = tab === "gpu" ? gpuFps : cpuFps;
  const fpsColor = activeFps >= 55 ? "text-emerald-400" : activeFps >= 30 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#05030a] text-white flex items-stretch justify-center">

      {/* ── Background glows ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="absolute top-24 -right-56 h-[560px] w-[560px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-52 left-1/3 h-[700px] w-[700px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ── Centered wrapper ── */}
      <div className="relative z-10 flex w-full max-w-[1440px] min-w-0">

      {/* ── Left panel ── */}
      <aside className="shrink-0 flex flex-col gap-3 p-5 border-r border-white/10 bg-black/20 backdrop-blur-md overflow-y-auto" style={{width: "26rem"}}>

        {/* Title */}
        <div className="flex items-center gap-2 pb-2 border-b border-white/10">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          <span className="font-black text-sm tracking-tight">
            Text <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">Goes Boom</span>
          </span>
          <span className="ml-auto text-xs text-white/40">WASM · WebGPU</span>
        </div>

        {/* Text input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Text</label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rebuildParticles(); }}
            className="w-full px-3 py-2 rounded-xl bg-black/50 text-white text-sm outline-none border border-white/10 focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/20 placeholder-white/30"
            placeholder="Type something…"
          />
          <button
            onClick={rebuildParticles}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-4 py-2.5 font-bold text-sm text-black shadow-[0_8px_24px_rgba(217,70,239,0.3)] hover:brightness-110 active:brightness-95"
          >
            Rebuild particles
          </button>
        </div>

        {/* Density */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Density</label>
            <span className="text-xs tabular-nums text-white/40">step={step}</span>
          </div>
          <input type="range" min={1} max={6} value={step}
            onChange={(e) => setStep(parseInt(e.target.value, 10))}
            className="w-full accent-fuchsia-400" />
        </div>

        {/* Font size */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Font size</label>
            <span className="text-xs tabular-nums text-white/40">{size}px</span>
          </div>
          <input type="range" min={60} max={220} value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10))}
            className="w-full accent-cyan-300" />
        </div>

        <button
          onClick={rebuildParticles}
          className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 font-semibold text-sm py-2"
        >
          Apply sliders
        </button>

        {/* Particles count */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex justify-between items-center">
          <span className="text-xs text-white/50">Particles</span>
          <span className="text-sm font-bold tabular-nums text-white/90">{particleCount.toLocaleString()}</span>
        </div>

        {/* Benchmark */}
        {bench && (
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Setup time · WASM vs JS</div>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs text-white/50">WASM</span>
                <span className="text-3xl font-black tabular-nums text-cyan-300 leading-tight">{bench.wasmMs.toFixed(0)}<span className="text-base font-bold text-cyan-400/60"> ms</span></span>
              </div>
              <div className="text-2xl font-black text-white/20">vs</div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-white/50">JS</span>
                <span className="text-3xl font-black tabular-nums text-fuchsia-300 leading-tight">{bench.jsMs.toFixed(0)}<span className="text-base font-bold text-fuchsia-400/60"> ms</span></span>
              </div>
            </div>
            <div className="rounded-xl bg-black/30 px-3 py-2.5 text-center">
              {bench.jsMs > bench.wasmMs ? (
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-white/50 text-sm font-semibold">WASM</span>
                  <span className="text-4xl font-black text-emerald-400 tabular-nums leading-none">{(bench.jsMs / bench.wasmMs).toFixed(1)}×</span>
                  <span className="text-white/50 text-sm font-semibold">faster</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-white/50 text-sm font-semibold">JS</span>
                  <span className="text-4xl font-black text-fuchsia-300 tabular-nums leading-none">{(bench.wasmMs / bench.jsMs).toFixed(1)}×</span>
                  <span className="text-white/50 text-sm font-semibold">faster</span>
                </div>
              )}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
        )}
      </aside>

      {/* ── Canvas area ── */}
      <main className="relative z-10 flex-1 flex flex-col p-4 gap-3 min-w-0">

        {/* Tab switcher + FPS row */}
        <div className="flex items-center gap-3">
          {(["gpu", "cpu"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t
                  ? t === "gpu"
                    ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.2)]"
                    : "bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-300 shadow-[0_0_16px_rgba(217,70,239,0.2)]"
                  : "border border-white/10 bg-white/5 text-white/50 hover:text-white/70"
              }`}
            >
              {t === "gpu" ? "WebGPU" : "Canvas 2D"}
            </button>
          ))}

          {/* FPS centered in pill */}
          <div className="flex-1 flex justify-center">
            {status === "ready" && (
              <div className={`flex items-baseline gap-2 rounded-2xl border bg-black/40 backdrop-blur-md px-8 py-2 ${
                activeFps >= 55 ? "border-emerald-400/30" : activeFps >= 30 ? "border-yellow-400/30" : "border-red-400/30"
              }`}>
                <span className={`text-5xl font-black tabular-nums leading-none ${fpsColor}`}>{activeFps}</span>
                <span className="text-xl font-bold text-white/40">fps</span>
              </div>
            )}
            {status === "boot" && (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                Booting…
              </div>
            )}
          </div>

          {/* particles — right-aligned, balances tabs on the left */}
          {status === "ready" && (
            <div className="flex items-baseline gap-1.5 w-[180px] justify-end">
              <span className="text-4xl font-black tabular-nums leading-none text-white/70">{particleCount.toLocaleString()}</span>
              <span className="text-base font-bold text-white/35">ptcl</span>
            </div>
          )}
          {status !== "ready" && <div className="w-[180px]" />}
        </div>

        {/* Canvas */}
        <div className="relative flex-1 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden shadow-[0_30px_140px_rgba(0,0,0,0.65)]">
          <canvas
            ref={gpuCanvasRef}
            className={`absolute inset-0 w-full h-full block transition-opacity duration-200 ${tab !== "gpu" ? "opacity-0 pointer-events-none" : ""}`}
          />
          <canvas
            ref={cpuCanvasRef}
            className={`absolute inset-0 w-full h-full block transition-opacity duration-200 ${tab !== "cpu" ? "opacity-0 pointer-events-none" : ""}`}
          />

          {switching && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/60 px-6 py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <span className="text-sm font-semibold text-white/80">Switching renderer…</span>
              </div>
            </div>
          )}

          {/* Bottom-left hint */}
          {status === "ready" && (
            <div className="pointer-events-none absolute bottom-4 left-4">
              <span className="text-xs text-white/30">click · drag to explode</span>
            </div>
          )}
        </div>

        {/* Stage info boxes */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md px-4 py-3">
            <div className="text-xs text-white/40 uppercase tracking-wider">Stage 1 · Rust / WASM</div>
            <div className="mt-1 font-bold text-sm">SDF + Relaxation</div>
            <div className="mt-1 text-xs text-white/55">Felzenszwalb–Huttenlocher EDT in O(w·h). 4 rounds of spatial-grid repulsion spread particles evenly inside the glyph.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md px-4 py-3">
            <div className="text-xs text-white/40 uppercase tracking-wider">Stage 2 · Physics</div>
            <div className="mt-1 font-bold text-sm">Spring + noise</div>
            <div className="mt-1 text-xs text-white/55">WebGPU tab: compute shader, all particles in parallel. Canvas 2D tab: identical JS loop, single thread.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md px-4 py-3">
            <div className="text-xs text-white/40 uppercase tracking-wider">Stage 3 · Render</div>
            <div className="mt-1 font-bold text-sm">GPU vs CPU draw</div>
            <div className="mt-1 text-xs text-white/55">WebGPU: one instanced draw call. Canvas 2D: N arc() calls per frame — this is where the FPS gap shows.</div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
