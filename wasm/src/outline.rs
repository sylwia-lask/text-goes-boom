pub fn build_inside_mask(w: usize, h: usize, rgba: &[u8], alpha_threshold: u8) -> Vec<u8> {
    let mut inside = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let a = rgba[idx + 3];
            inside[y * w + x] = if a > alpha_threshold { 1 } else { 0 };
        }
    }
    inside
}

fn dilate(w: usize, h: usize, mask: &[u8], radius: i32) -> Vec<u8> {
    if radius <= 0 {
        return mask.to_vec();
    }

    let mut out = vec![0u8; w * h];
    let r = radius;

    for y in 0..h as i32 {
        for x in 0..w as i32 {
            if mask[y as usize * w + x as usize] == 0 {
                continue;
            }

            for oy in -r..=r {
                let yy = y + oy;
                if yy < 0 || yy >= h as i32 {
                    continue;
                }
                for ox in -r..=r {
                    let xx = x + ox;
                    if xx < 0 || xx >= w as i32 {
                        continue;
                    }
                    out[yy as usize * w + xx as usize] = 1;
                }
            }
        }
    }

    out
}

fn edge8(w: usize, h: usize, inside: &[u8]) -> Vec<u8> {
    let mut edge = vec![0u8; w * h];

    for y in 1..(h.saturating_sub(1)) {
        for x in 1..(w.saturating_sub(1)) {
            let i = y * w + x;
            if inside[i] == 0 {
                continue;
            }

            let mut is_edge = false;
            for oy in -1i32..=1 {
                for ox in -1i32..=1 {
                    if ox == 0 && oy == 0 {
                        continue;
                    }
                    let xx = (x as i32 + ox) as usize;
                    let yy = (y as i32 + oy) as usize;
                    if inside[yy * w + xx] == 0 {
                        is_edge = true;
                        break;
                    }
                }
                if is_edge {
                    break;
                }
            }

            if is_edge {
                edge[i] = 1;
            }
        }
    }

    edge
}

pub fn build_edge_mask(w: usize, h: usize, inside: &[u8]) -> Vec<u8> {
    const THICK1: i32 = 2;
    const GAP: i32 = 3;
    const THICK2: i32 = 2;

    let base = edge8(w, h, inside);
    let ring1 = dilate(w, h, &base, THICK1);

    let d_gap = dilate(w, h, inside, GAP);
    let d_outer = dilate(w, h, inside, GAP + THICK2);

    let mut out = vec![0u8; w * h];
    for i in 0..(w * h) {
        let outer_ring = if d_outer[i] == 1 && d_gap[i] == 0 { 1 } else { 0 };
        out[i] = if ring1[i] == 1 || outer_ring == 1 { 1 } else { 0 };
    }

    out
}

pub fn project_to_nearest_edge(
    x: f32,
    y: f32,
    w: usize,
    h: usize,
    edge: &[u8],
    radius_px: i32,
) -> (f32, f32) {
    let xi = x.round() as i32;
    let yi = y.round() as i32;

    let mut best_d2 = f32::INFINITY;
    let mut best = (x, y);

    let r = radius_px.max(1);

    for dy in -r..=r {
        let yy = yi + dy;
        if yy < 0 || yy >= h as i32 {
            continue;
        }
        for dx in -r..=r {
            let xx = xi + dx;
            if xx < 0 || xx >= w as i32 {
                continue;
            }
            let idx = yy as usize * w + xx as usize;
            if edge[idx] == 0 {
                continue;
            }
            let fx = xx as f32 + 0.5;
            let fy = yy as f32 + 0.5;
            let ddx = fx - x;
            let ddy = fy - y;
            let d2 = ddx * ddx + ddy * ddy;
            if d2 < best_d2 {
                best_d2 = d2;
                best = (fx, fy);
            }
        }
    }

    best
}
