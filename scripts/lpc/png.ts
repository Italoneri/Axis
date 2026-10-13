/**
 * Straight PNG decoding (no premultiplied alpha, unlike a canvas), so two files
 * compare by their exact stored pixels even when their encoders differ.
 */
import { inflateSync } from 'node:zlib';

export interface Pixels {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row by row. */
  readonly rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Bytes per pixel for 8-bit color types: 2 = RGB, 6 = RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };

interface Header {
  width: number;
  height: number;
  channels: number;
}

export function decodePng(file: Uint8Array): Pixels {
  if (!SIGNATURE.every((byte, i) => file[i] === byte)) throw new Error('not a PNG file');
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let header: Header | undefined;
  const data: Uint8Array[] = [];
  for (let offset = SIGNATURE.length; offset < file.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = readHeader(body);
    if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  if (header === undefined) throw new Error('PNG without IHDR');
  return unfilter(header, inflateSync(Buffer.concat(data)));
}

function readHeader(body: Uint8Array): Header {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const [bitDepth, colorType, , , interlace] = body.subarray(8, 13);
  const channels = CHANNELS[colorType ?? -1];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error(`unsupported PNG (bit depth ${bitDepth}, color type ${colorType})`);
  }
  return { width: view.getUint32(0), height: view.getUint32(4), channels };
}

function unfilter({ width, height, channels }: Header, raw: Uint8Array): Pixels {
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? (rows[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (rows[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = x >= channels && y > 0 ? (rows[(y - 1) * stride + x - channels] ?? 0) : 0;
      rows[y * stride + x] = ((source[x] ?? 0) + predictor(filter, left, up, upLeft)) & 0xff;
    }
  }
  return { width, height, rgba: channels === 4 ? rows : withOpaqueAlpha(rows) };
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  return 0;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

function withOpaqueAlpha(rgb: Uint8Array): Uint8Array {
  const rgba = new Uint8Array((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba.set(rgb.subarray(i, i + 3), j);
    rgba[j + 3] = 255;
  }
  return rgba;
}

export function differentPixels(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height) {
    return Math.max(a.rgba.length, b.rgba.length) / 4;
  }
  let count = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    if (a.rgba.subarray(i, i + 4).some((value, channel) => value !== b.rgba[i + channel])) count++;
  }
  return count;
}

export function samePixels(a: Uint8Array, b: Uint8Array): boolean {
  return differentPixels(decodePng(a), decodePng(b)) === 0;
}
