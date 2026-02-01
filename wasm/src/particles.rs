use crate::outline::{build_edge_mask, build_inside_mask, project_to_nearest_edge};
use crate::relax::relax_on_edges;
use crate::rng::Lcg;

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
    let edge = build_edge_mask(w, h, &inside);

    let step = step.max(1) as usize;
    let keep_prob = 1.0 / (step as f32 * step as f32);

    let mut rng = Lcg::new(0xA3C5_1F2D);

    const MULTI: usize = 4;

    let mut px: Vec<f32> = Vec::new();
    let mut py: Vec<f32> = Vec::new();

    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if edge[i] == 0 {
                continue;
            }

            if rng.next_f32() > keep_prob {
                continue;
            }

            for _ in 0..MULTI {
                let jx = (rng.next_f32() - 0.5) * (step as f32 * 0.9);
                let jy = (rng.next_f32() - 0.5) * (step as f32 * 0.9);

                let mut fx = x as f32 + 0.5 + jx;
                let mut fy = y as f32 + 0.5 + jy;

                fx = fx.clamp(0.5, w as f32 - 0.5);
                fy = fy.clamp(0.5, h as f32 - 0.5);

                let (sx, sy) = project_to_nearest_edge(
                    fx,
                    fy,
                    w,
                    h,
                    &edge,
                    (step as i32).max(4) * 2,
                );
                px.push(sx);
                py.push(sy);
            }
        }
    }

    let radius_px = (step as f32 * 1.25 + 2.0).max(2.0);
    let iters = 7;
    let snap_radius_px = (step as i32).max(2) * 3 + 5;

    relax_on_edges(&mut px, &mut py, w, h, &edge, radius_px, iters, snap_radius_px);

    let n = px.len();
    let mut out: Vec<f32> = Vec::with_capacity(n * 8);

    for i in 0..n {
        let nx = px[i] / w as f32;
        let ny = py[i] / h as f32;

        let cx = nx * 2.0 - 1.0;
        let cy = 1.0 - ny * 2.0;

        let seed = rng.next_f32();
        let life = 1.0;

        out.push(cx);
        out.push(cy);
        out.push(0.0);
        out.push(0.0);

        out.push(cx);
        out.push(cy);
        out.push(seed);
        out.push(life);
    }

    out
}
