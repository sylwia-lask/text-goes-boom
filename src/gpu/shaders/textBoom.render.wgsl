struct ParticleA { a: vec4<f32> }; 
@group(0) @binding(0) var<storage, read> particlesA : array<ParticleA>;

struct RenderParams {
  resolution: vec2<f32>,  
  particleSize: f32,     
  time: f32,
};
@group(0) @binding(1) var<uniform> rp : RenderParams;

struct VSIn {
  @location(0) corner: vec2<f32>,  
  @location(1) uv: vec2<f32>,     
  @builtin(instance_index) instance: u32,
};

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VSIn) -> VSOut {
  let p = particlesA[input.instance].a.xy; 

  let sx = (rp.particleSize * 2.0) / max(rp.resolution.x, 1.0);
  let sy = (rp.particleSize * 2.0) / max(rp.resolution.y, 1.0);

  let offset = vec2<f32>(input.corner.x * sx, input.corner.y * sy);

  var out: VSOut;
  out.pos = vec4<f32>(p + offset, 0.0, 1.0);
  out.uv = input.uv;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let c = in.uv * 2.0 - vec2<f32>(1.0, 1.0);
  let r2 = dot(c, c);
  if (r2 > 1.0) {
    discard;
  }

  let alpha = smoothstep(1.0, 0.6, r2);

  return vec4<f32>(1.0, 1.0, 1.0, alpha);
}
