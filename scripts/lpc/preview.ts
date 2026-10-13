import { createCanvas, loadImage } from '@napi-rs/canvas';

const FRAME = 64;
const SCALE = 2;
/** Walk sheet rows, top to bottom: north, west, south, east. */
const DIRECTIONS = 4;

/** The standing frame of each walk direction side by side, scaled up without smoothing. */
export async function walkPreview(walkSheet: Uint8Array): Promise<Uint8Array> {
  const sheet = await loadImage(Buffer.from(walkSheet));
  const size = FRAME * SCALE;
  const canvas = createCanvas(size * DIRECTIONS, size);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  for (let row = 0; row < DIRECTIONS; row++) {
    context.drawImage(sheet, 0, row * FRAME, FRAME, FRAME, row * size, 0, size, size);
  }
  return new Uint8Array(await canvas.encode('png'));
}
