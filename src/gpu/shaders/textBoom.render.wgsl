struct ParticleA {
  a: vec4<f32>,
}

struct RenderParams {
  resolution: vec2<f32>,
  particleSize: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> particlesA : array<ParticleA>;
@group(0) @binding(1) var<uniform> rp : RenderParams;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) p: vec2<f32>,
  @location(2) @interpolate(flat) id: u32,
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
  @location(0) corner: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @builtin(instance_index) instance: u32
) -> VSOut {
  let p = particlesA[instance].a.xy;

  let px = (corner.x * rp.particleSize * 2.0) / max(1.0, rp.resolution.x);
  let py = (corner.y * rp.particleSize * 2.0) / max(1.0, rp.resolution.y);

  var out: VSOut;
  out.pos = vec4<f32>(p.x + px, p.y + py, 0.0, 1.0);
  out.uv = uv;
  out.p = p;
  out.id = instance;
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

  let pink    = vec3<f32>(1.00, 0.20, 0.78);
  let fuchsia = vec3<f32>(1.00, 0.00, 0.92);
  let violet  = vec3<f32>(0.55, 0.30, 1.00);

  let rnd = hash01(in.id);

  let t = saturate(
    0.5 + 0.5 * in.p.x +
    0.10 * sin(rp.time * 0.9 + rnd * 6.283)
  );

  let base = mix3(pink, fuchsia, violet, t);

  let glow = alpha * alpha * (1.2 + 0.6 * sin(rp.time * 0.7 + rnd * 8.0));
  let rgb = base * (0.35 + 1.25 * glow);

  return vec4<f32>(rgb, alpha);
}
