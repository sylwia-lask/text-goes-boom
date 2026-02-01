use crate::outline::project_to_nearest_edge;

pub fn relax_on_edges(
    px: &mut [f32],
    py: &mut [f32],
    w: usize,
    h: usize,
    edge: &[u8],
    radius_px: f32,
    iters: u32,
    snap_radius_px: i32,
) {
    let n = px.len();
    if n == 0 {
        return;
    }

    let r = radius_px.max(1.0);
    let r2 = r * r;
    let cell = r;
    let cols = ((w as f32) / cell).ceil().max(1.0) as usize;
    let rows = ((h as f32) / cell).ceil().max(1.0) as usize;

    let mut grid: Vec<Vec<usize>> = vec![Vec::new(); cols * rows];
    let mut dx = vec![0.0f32; n];
    let mut dy = vec![0.0f32; n];

    for _ in 0..iters {
        for cellv in grid.iter_mut() {
            cellv.clear();
        }

        for i in 0..n {
            let cx = (px[i] / cell).floor() as i32;
            let cy = (py[i] / cell).floor() as i32;
            let cx = cx.clamp(0, cols as i32 - 1) as usize;
            let cy = cy.clamp(0, rows as i32 - 1) as usize;
            grid[cy * cols + cx].push(i);
        }

        dx.fill(0.0);
        dy.fill(0.0);

        for i in 0..n {
            let cx = (px[i] / cell).floor() as i32;
            let cy = (py[i] / cell).floor() as i32;

            for oy in -1..=1 {
                let ny = cy + oy;
                if ny < 0 || ny >= rows as i32 {
                    continue;
                }
                for ox in -1..=1 {
                    let nx = cx + ox;
                    if nx < 0 || nx >= cols as i32 {
                        continue;
                    }
                    let bucket = &grid[ny as usize * cols + nx as usize];
                    for &j in bucket.iter() {
                        if j == i {
                            continue;
                        }
                        let vx = px[i] - px[j];
                        let vy = py[i] - py[j];
                        let d2 = vx * vx + vy * vy;
                        if d2 <= 1e-6 || d2 >= r2 {
                            continue;
                        }
                        let d = d2.sqrt();
                        let push = (r - d) / r;
                        let nxv = vx / d;
                        let nyv = vy / d;
                        dx[i] += nxv * push;
                        dy[i] += nyv * push;
                    }
                }
            }
        }

        let strength = 0.35;
        for i in 0..n {
            px[i] += dx[i] * strength;
            py[i] += dy[i] * strength;

            px[i] = px[i].clamp(0.5, w as f32 - 0.5);
            py[i] = py[i].clamp(0.5, h as f32 - 0.5);

            let (sx, sy) = project_to_nearest_edge(px[i], py[i], w, h, edge, snap_radius_px);
            px[i] = sx;
            py[i] = sy;
        }
    }
}
