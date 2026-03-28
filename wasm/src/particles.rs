use crate::outline::build_inside_mask;
use crate::relax::relax_inside;
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
    let sdf = compute_sdf(w, h, &inside);

    let step = step.max(1) as usize;
    let half = step.max(1) / 2;
    let mut rng = Lcg::new(0xA3C5_1F2D);

    let mut px: Vec<f32> = Vec::new();
    let mut py: Vec<f32> = Vec::new();

    let mut y = half.max(1);
    while y < h {
        let mut x = half.max(1);
        while x < w {
            let i = y * w + x;
            if inside[i] == 0 {
                x += step;
                continue;
            }

            let jx = (rng.next_f32() - 0.5) * step as f32 * 0.85;
            let jy = (rng.next_f32() - 0.5) * step as f32 * 0.85;
            let fx = (x as f32 + 0.5 + jx).clamp(0.5, w as f32 - 0.5);
            let fy = (y as f32 + 0.5 + jy).clamp(0.5, h as f32 - 0.5);

            px.push(fx);
            py.push(fy);

            x += step;
        }
        y += step;
    }

    let radius_px = (step as f32 * 1.3 + 1.5).max(2.0);
    relax_inside(&mut px, &mut py, w, h, &inside, radius_px, 4);

    let n = px.len();
    let mut out: Vec<f32> = Vec::with_capacity(n * 8);

    for i in 0..n {
        let ix = (px[i] as usize).min(w - 1);
        let iy = (py[i] as usize).min(h - 1);
        let sdf_val = if inside[iy * w + ix] == 1 { sdf[iy * w + ix] } else { 0.0 };

        let cx = px[i] / w as f32 * 2.0 - 1.0;
        let cy = 1.0 - py[i] / h as f32 * 2.0;
        let seed = rng.next_f32();

        out.extend_from_slice(&[cx, cy, 0.0, 0.0, cx, cy, seed, sdf_val]);
    }

    out
}
