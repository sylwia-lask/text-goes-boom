struct ParticleA {
  a: vec4<f32>, // pos.xy, vel.xy
}

struct ParticleB {
  b: vec4<f32>, // home.xy, seed, sdf  (sdf: 0=edge, 1=interior)
}

struct RenderParams {
  resolution: vec2<f32>,
  particleSize: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> particlesA : array<ParticleA>;
@group(0) @binding(1) var<uniform>       rp          : RenderParams;
@group(0) @binding(2) var<storage, read> particlesB  : array<ParticleB>;

struct VSOut {
  @builtin(position)              pos : vec4<f32>,
  @location(0)                    uv  : vec2<f32>,
  @location(1) @interpolate(flat) id  : u32,
  @location(2) @interpolate(flat) sdf : f32,
}

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

fn mix3(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, t: f32) -> vec3<f32> {
  let u = saturate(t);
  if (u < 0.5) {
    return mix(a, b, u * 2.0);
  }
  return mix(b, c, (u - 0.5) * 2.0);
}

fn hash_u32(x0: u32) -> u32 {
  var x = x0;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn hash01(x: u32) -> f32 {
  let h = hash_u32(x);
  let v = h & 0x00FFFFFFu;
  return f32(v) / 16777216.0;
}

@vertex
fn vs_main(
  @location(0)                    corner   : vec2<f32>,
  @location(1)                    uv       : vec2<f32>,
  @builtin(instance_index)        instance : u32
) -> VSOut {
  let p   = particlesA[instance].a.xy;
  let sdf = particlesB[instance].b.w; // 0 = edge, 1 = deep interior

  let px = (corner.x * rp.particleSize * 2.0) / max(1.0, rp.resolution.x);
  let py = (corner.y * rp.particleSize * 2.0) / max(1.0, rp.resolution.y);

  var out: VSOut;
  out.pos = vec4<f32>(p.x + px, p.y + py, 0.0, 1.0);
  out.uv  = uv;
  out.id  = instance;
  out.sdf = sdf;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv - vec2<f32>(0.5, 0.5));

  var soft: f32;
  if (rp.particleSize <= 2.5) {
    soft = 0.55;
  } else {
    soft = 0.60;
  }
  let alpha = smoothstep(soft, 0.0, d);

  // --- colour palette ---
  // Edge particles (sdf ≈ 0): hot pink / fuchsia
  // Interior particles (sdf ≈ 1): deep violet / indigo
  let hot_pink = vec3<f32>(1.00, 0.20, 0.78);
  let fuchsia  = vec3<f32>(1.00, 0.00, 0.92);
  let violet   = vec3<f32>(0.55, 0.30, 1.00);
  let indigo   = vec3<f32>(0.28, 0.10, 0.80);

  let rnd = hash01(in.id);

  // Subtle per-particle shimmer
  let shimmer = 0.08 * sin(rp.time * 1.1 + rnd * 6.283);

  // SDF drives the main colour: edge → fuchsia, interior → indigo
  let sdf_t = saturate(in.sdf + shimmer);
  let base  = mix3(hot_pink, violet, indigo, sdf_t);

  // Brightness: edge particles are ~30% brighter than interior ones
  let brightness = mix(1.15, 0.75, saturate(in.sdf));

  let glow = alpha * alpha * (brightness + 0.5 * sin(rp.time * 0.7 + rnd * 8.0));
  let rgb  = base * (0.30 + 1.30 * glow);

  return vec4<f32>(rgb, alpha);
}
