use crate::outline::build_inside_mask;
use crate::rng::Lcg;
use crate::sdf::compute_sdf;

pub fn particles_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
    step: u32,
    alpha_threshold: u8,
) -> Vec<f32> {
    let w = width as usize;
    let h = height as usize;

    if w == 0 || h == 0 || rgba.len() < w * h * 4 {
        return vec![];
    }

    let inside = build_inside_mask(w, h, rgba, alpha_threshold);

    // SDF: 0.0 = on the edge, 1.0 = deepest interior.
    // This is the real work that justifies WASM – O(w*h) exact EDT.
    let sdf = compute_sdf(w, h, &inside);

    let step = step.max(1) as usize;
    let half = step / 2;

    let mut rng = Lcg::new(0xA3C5_1F2D);
    let mut out: Vec<f32> = Vec::new();

    // Grid-sample every interior pixel at `step`-pixel intervals.
    // Pixels near the edge (low SDF) are always kept; deep interior
    // pixels are kept with decreasing probability so the density
    // naturally tapers toward the centre – making the edge pop visually.
    let mut y = half.max(1);
    while y < h {
        let mut x = half.max(1);
        while x < w {
            let i = y * w + x;
            if inside[i] == 0 {
                x += step;
                continue;
            }

            let sdf_here = sdf[i];

            // Probability: 1.0 on the edge → ~0.25 deep in the interior.
            // This keeps outlines sharp and fills the body with fewer particles.
            let prob = 1.0 - sdf_here * 0.75;
            if rng.next_f32() > prob {
                x += step;
                continue;
            }

            // Small sub-pixel jitter so the grid pattern is invisible.
            let jx = (rng.next_f32() - 0.5) * step as f32 * 0.85;
            let jy = (rng.next_f32() - 0.5) * step as f32 * 0.85;
            let fx = (x as f32 + 0.5 + jx).clamp(0.5, w as f32 - 0.5);
            let fy = (y as f32 + 0.5 + jy).clamp(0.5, h as f32 - 0.5);

            // SDF at jittered position (fall back to grid-cell value if outside).
            let ix = (fx as usize).min(w - 1);
            let iy = (fy as usize).min(h - 1);
            let sdf_val = if inside[iy * w + ix] == 1 {
                sdf[iy * w + ix]
            } else {
                sdf_here
            };

            // Convert pixel coords to NDC [-1, 1].
            let cx = fx / w as f32 * 2.0 - 1.0;
            let cy = 1.0 - fy / h as f32 * 2.0;

            let seed = rng.next_f32();

            // 8 floats per particle:
            //   particlesA: pos.x, pos.y, vel.x, vel.y
            //   particlesB: home.x, home.y, seed, sdf   ← sdf replaces life
            out.extend_from_slice(&[cx, cy, 0.0, 0.0, cx, cy, seed, sdf_val]);

            x += step;
        }
        y += step;
    }

    out
}
