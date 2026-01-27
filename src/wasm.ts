import initWasm, { particles_from_rgba } from "./wasm-pkg/text_layout_wasm"; // <-- dostosuj ścieżkę

let _ready: Promise<void> | null = null;

export function ensureWasmReady(): Promise<void> {
  if (!_ready) {
    _ready = initWasm().then(() => void 0);
  }
  return _ready;
}

export function particlesFromImageData(
  img: ImageData,
  step = 2,
  alphaThreshold = 10,
): Float32Array {
  const rgba = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);

  const floats = particles_from_rgba(img.width, img.height, rgba, step, alphaThreshold);
  return new Float32Array(floats);
}
