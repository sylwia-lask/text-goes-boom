pub struct Lcg {
    state: u32,
}

impl Lcg {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_f32(&mut self) -> f32 {
        self.state = self
            .state
            .wrapping_mul(1664525)
            .wrapping_add(1013904223);

        let v = (self.state >> 8) & 0x00FF_FFFF;
        v as f32 / 0x0100_0000 as f32
    }
}
