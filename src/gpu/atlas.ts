export type FontAtlas = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  firstChar: number; 
  glyphCount: number;
};

export async function createAsciiFontAtlas(options?: {
  font?: string;         
  cellW?: number;
  cellH?: number;
  cols?: number;
  firstChar?: number;     
  lastChar?: number;      
}): Promise<FontAtlas> {
  const font = options?.font ?? "24px monospace";
  const cellW = options?.cellW ?? 32;
  const cellH = options?.cellH ?? 32;
  const cols = options?.cols ?? 16;
  const firstChar = options?.firstChar ?? 32;
  const lastChar = options?.lastChar ?? 126;

  const glyphCount = lastChar - firstChar + 1;
  const rows = Math.ceil(glyphCount / cols);

  const width = cols * cellW;
  const height = rows * cellH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D not available");

  ctx.clearRect(0, 0, width, height);

  ctx.font = font;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < glyphCount; i++) {
    const code = firstChar + i;
    const ch = String.fromCharCode(code);

    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = col * cellW + cellW / 2;
    const y = row * cellH + cellH / 2;

    ctx.fillText(ch, x, y);
  }

  const bitmap = await createImageBitmap(canvas);
  return { bitmap, width, height, cellW, cellH, cols, rows, firstChar, glyphCount };
}
