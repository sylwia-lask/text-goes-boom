struct ParticleA {
  a: vec4<f32>,
};

struct ParticleB {
  b: vec4<f32>,
};

struct SimParams {
  dt: f32,
  time: f32,
  mouse: vec2<f32>,      
  mouseDown: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> particlesA : array<ParticleA>;
@group(0) @binding(1) var<storage, read_write> particlesB : array<ParticleB>;
@group(0) @binding(2) var<uniform> sim : SimParams;

fn hash11(x: f32) -> f32 {
  let s = sin(x * 12.9898) * 43758.5453;
  return fract(s);
}

fn noise2(p: vec2<f32>) -> vec2<f32> {
  let n1 = hash11(p.x * 10.0 + p.y * 57.0 + sim.time);
  let n2 = hash11(p.x * 99.0 + p.y * 13.0 + sim.time * 0.73);
  return vec2<f32>(n1 - 0.5, n2 - 0.5);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particlesA)) {
    return;
  }

  var a = particlesA[i].a;
  var b = particlesB[i].b;

  var pos = a.xy;
  var vel = a.zw;
  let home = b.xy;
  let seed = b.z;
  var life = b.w;

  let toHome = home - pos;
  let springK = 10.0;
  var acc = toHome * springK;

  let n = noise2(pos * (2.0 + seed * 3.0));
  acc += n * 2.0;

  if (sim.mouseDown == 1u) {
    let d = pos - sim.mouse;
    let dist2 = max(dot(d, d), 0.0005);
    let strength = 0.05 / dist2; 
    acc += normalize(d) * strength;
  }

  let damping = 0.92;
  vel = vel * damping;

  vel = vel + acc * sim.dt;
  pos = pos + vel * sim.dt;

  if (pos.x < -1.1) { pos.x = -1.1; vel.x *= -0.4; }
  if (pos.x >  1.1) { pos.x =  1.1; vel.x *= -0.4; }
  if (pos.y < -1.1) { pos.y = -1.1; vel.y *= -0.4; }
  if (pos.y >  1.1) { pos.y =  1.1; vel.y *= -0.4; }

  life = life;

  particlesA[i].a = vec4<f32>(pos, vel);
  particlesB[i].b = vec4<f32>(home, seed, life);
}
