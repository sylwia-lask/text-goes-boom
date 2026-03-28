// 1-D squared EDT (Felzenszwalb-Huttenlocher).
// f[i] = 0.0 for seed pixels, INFINITY for non-seeds.
fn dt1d(f: &[f32]) -> Vec<f32> {
    let n = f.len();
    let mut d = vec![f32::INFINITY; n];
    if n == 0 {
        return d;
    }

    let mut v = vec![0i32; n];
    let mut z = vec![0f32; n + 1];
    let mut k: i32 = -1;

    for q in 0..n as i32 {
        let fq = f[q as usize];
        if fq == f32::INFINITY {
            continue;
        }

        loop {
            if k < 0 {
                k = 0;
                v[0] = q;
                z[0] = f32::NEG_INFINITY;
                z[1] = f32::INFINITY;
                break;
            }

            let r = v[k as usize];
            let fr = f[r as usize];
            let s = ((fq + (q * q) as f32) - (fr + (r * r) as f32))
                / (2.0 * (q - r) as f32);

            if s <= z[k as usize] {
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
        return d;
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

pub fn compute_sdf(w: usize, h: usize, inside: &[u8]) -> Vec<f32> {
    let n = w * h;

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

    let mut dist2 = vec![0f32; n];
    for x in 0..w {
        let f: Vec<f32> = (0..h).map(|y| tmp[y * w + x]).collect();
        let d = dt1d(&f);
        for y in 0..h {
            dist2[y * w + x] = d[y];
        }
    }

    let max_dist = dist2
        .iter()
        .enumerate()
        .filter(|&(i, _)| inside[i] == 1)
        .map(|(_, &v)| v)
        .fold(0f32, f32::max)
        .sqrt()
        .max(1.0);

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
