use wasm_bindgen::prelude::*;

mod particles;
mod rng;

#[wasm_bindgen]
pub fn particles_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
    step: u32,
    alpha_threshold: u8,
) -> Vec<f32> {
    particles::particles_from_rgba(width, height, rgba, step, alpha_threshold)
}
