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

    let step = step.max(1) as usize;
    let mut out = Vec::with_capacity((w / step) * (h / step) * 8);

    let mut rng = Lcg::new(0x1234_5678);

    for y in (0..h).step_by(step) {
        for x in (0..w).step_by(step) {
            let idx = (y * w + x) * 4;
            let a = rgba[idx + 3];

            if a <= alpha_threshold {
                continue;
            }

            let nx = (x as f32 + 0.5) / w as f32;
            let ny = (y as f32 + 0.5) / h as f32;

            let mut cx = nx * 2.0 - 1.0;
            let mut cy = 1.0 - ny * 2.0;

            cx += (rng.next_f32() - 0.5) * 0.01;
            cy += (rng.next_f32() - 0.5) * 0.01;

            let seed = rng.next_f32();
            let life = 1.0;

            out.extend_from_slice(&[
                cx,
                cy,
                0.0,
                0.0,
                cx,
                cy,
                seed,
                life,
            ]);
        }
    }

    out
}
