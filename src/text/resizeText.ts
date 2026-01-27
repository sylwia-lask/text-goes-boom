export type RasterTextOptions = {
  text: string;
  fontFamily?: string;  
  fontWeight?: string;  
  fontSizePx?: number;  
  paddingPx?: number;   
};

export function rasterizeTextToImageData(opts: RasterTextOptions): ImageData {
  const text = opts.text;
  const fontFamily = opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const fontWeight = opts.fontWeight ?? "800";
  const fontSizePx = opts.fontSizePx ?? 140;
  const paddingPx = opts.paddingPx ?? 48;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");

  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const textW = Math.ceil(metrics.width);
  const textH = Math.ceil(fontSizePx * 1.2);

  canvas.width = textW + paddingPx * 2;
  canvas.height = textH + paddingPx * 2;

  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,1)";
  const x = paddingPx;
  const y = paddingPx + fontSizePx; 
  ctx.fillText(text, x, y);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
