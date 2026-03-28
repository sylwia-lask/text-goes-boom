struct ParticleA {
  a: vec4<f32>, // pos.xy, vel.xy
};

struct ParticleB {
  b: vec4<f32>, // home.xy, seed, sdf
};

struct SimParams {
  dt        : f32,
  time      : f32,
  mouse     : vec2<f32>,
  mouseDown : u32,
  damp      : f32,
};

@group(0) @binding(0) var<storage, read_write> particlesA : array<ParticleA>;
@group(0) @binding(1) var<storage, read>       particlesB : array<ParticleB>;
@group(0) @binding(2) var<uniform>             sim        : SimParams;

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 12.9898) * 43758.5453);
}

const SPRING : f32 = 12.0;
const DAMP   : f32 = 0.92;
const NOISE  : f32 = 1.5;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if i >= arrayLength(&particlesA) { return; }

  var myPos = particlesA[i].a.xy;
  var myVel = particlesA[i].a.zw;
  let home  = particlesB[i].b.xy;
  let seed  = particlesB[i].b.z;

  var acc = (home - myPos) * SPRING;

  let scale      = 2.0 + seed * 3.0;
  let noiseScale = sqrt(1.0 / (sim.dt * 60.0)); // normalise noise variance to dt=1/60 reference
  acc.x += (hash11(myPos.x * scale * 10.0 + myPos.y * scale * 57.0 + sim.time)        - 0.5) * NOISE * noiseScale;
  acc.y += (hash11(myPos.x * scale * 99.0 + myPos.y * scale * 13.0 + sim.time * 0.73) - 0.5) * NOISE * noiseScale;

  if sim.mouseDown == 1u {
    let d     = myPos - sim.mouse;
    let dist2 = max(dot(d, d), 0.0005);
    acc += normalize(d) * (0.05 / dist2);
  }

  myVel = myVel * sim.damp + acc * sim.dt;
  myPos = myPos + myVel * sim.dt;

  if myPos.x < -1.1 { myPos.x = -1.1; myVel.x *= -0.4; }
  if myPos.x >  1.1 { myPos.x =  1.1; myVel.x *= -0.4; }
  if myPos.y < -1.1 { myPos.y = -1.1; myVel.y *= -0.4; }
  if myPos.y >  1.1 { myPos.y =  1.1; myVel.y *= -0.4; }

  particlesA[i].a = vec4<f32>(myPos, myVel);
}
