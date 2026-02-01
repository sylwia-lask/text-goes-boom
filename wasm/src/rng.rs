pub struct Lcg {
    state: u32,
}

impl Lcg {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self
            .state
            .wrapping_mul(1664525)
            .wrapping_add(1013904223);
        self.state
    }

    pub fn next_f32(&mut self) -> f32 {
        let v = (self.next_u32() >> 8) & 0x00FF_FFFF;
        v as f32 / 0x0100_0000 as f32
    }
}
