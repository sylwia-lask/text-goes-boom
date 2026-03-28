/// 1-D squared Euclidean distance transform (Felzenszwalb-Huttenlocher).
///
/// `f[i]` must be 0.0 for seed pixels and `f32::INFINITY` for non-seeds.
/// Returns the squared distance to the nearest seed for every position.
fn dt1d(f: &[f32]) -> Vec<f32> {
    let n = f.len();
    let mut d = vec![f32::INFINITY; n];
    if n == 0 {
        return d;
    }

    // v[k]  – index of the parabola that owns the lower envelope at segment k
    // z[k]  – left boundary of segment k  (z[k+1] – right boundary)
    let mut v = vec![0i32; n];
    let mut z = vec![0f32; n + 1];
    let mut k: i32 = -1; // no parabola added yet

    for q in 0..n as i32 {
        let fq = f[q as usize];
        if fq == f32::INFINITY {
            continue; // an all-INF parabola never contributes to the lower envelope
        }

        loop {
            if k < 0 {
                // first seed
                k = 0;
                v[0] = q;
                z[0] = f32::NEG_INFINITY;
                z[1] = f32::INFINITY;
                break;
            }

            let r = v[k as usize];
            let fr = f[r as usize];
            // x-coordinate where parabola at q takes over from parabola at r
            let s = ((fq + (q * q) as f32) - (fr + (r * r) as f32))
                / (2.0 * (q - r) as f32);

            if s <= z[k as usize] {
                // parabola at r is dominated – remove it
                k -= 1;
            } else {
                k += 1;
                v[k as usize] = q;
                z[k as usize] = s;
                z[(k + 1) as usize] = f32::INFINITY;
                break;
            }
        }
    }

    if k < 0 {
        return d; // no seeds at all
    }

    let mut j: i32 = 0;
    for q in 0..n as i32 {
        while j < k && z[(j + 1) as usize] < q as f32 {
            j += 1;
        }
        let r = v[j as usize];
        let diff = (q - r) as f32;
        d[q as usize] = diff * diff + f[r as usize];
    }

    d
}

/// Compute a normalised interior SDF for every pixel.
///
/// Returns a `Vec<f32>` of length `w * h`:
/// - `0.0` for exterior pixels (outside the text)
/// - `0.0`–`1.0` for interior pixels, where `0.0` ≈ on the edge and
///   `1.0` ≈ deepest interior (farthest from any edge)
pub fn compute_sdf(w: usize, h: usize, inside: &[u8]) -> Vec<f32> {
    let n = w * h;

    // ── Pass 1: 1-D EDT along X for every row ──────────────────────────────
    // Seeds are exterior pixels (inside == 0).
    let mut tmp = vec![0f32; n];
    for y in 0..h {
        let f: Vec<f32> = (0..w)
            .map(|x| if inside[y * w + x] == 0 { 0.0 } else { f32::INFINITY })
            .collect();
        let d = dt1d(&f);
        for x in 0..w {
            tmp[y * w + x] = d[x];
        }
    }

    // ── Pass 2: 1-D EDT along Y for every column ───────────────────────────
    // Input values are the squared X-distances from pass 1; the 2-D EDT is
    // separable so this gives the true squared Euclidean distance.
    let mut dist2 = vec![0f32; n];
    for x in 0..w {
        let f: Vec<f32> = (0..h).map(|y| tmp[y * w + x]).collect();
        let d = dt1d(&f);
        for y in 0..h {
            dist2[y * w + x] = d[y];
        }
    }

    // ── Normalise to [0, 1] for interior pixels ─────────────────────────────
    let max_dist = dist2
        .iter()
        .enumerate()
        .filter(|&(i, _)| inside[i] == 1)
        .map(|(_, &v)| v)
        .fold(0f32, f32::max)
        .sqrt()
        .max(1.0); // avoid division by zero for single-pixel glyphs

    (0..n)
        .map(|i| {
            if inside[i] == 0 {
                0.0
            } else {
                (dist2[i].sqrt() / max_dist).min(1.0)
            }
        })
        .collect()
}
