import { createCanvas } from '@napi-rs/canvas';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stableMetadata, writeIfChanged } from './output';
import { decodePng, differentPixels } from './png';

async function png(color: string): Promise<Uint8Array> {
  const canvas = createCanvas(4, 2);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 2, 2);
  return new Uint8Array(await canvas.encode('png'));
}

/** The same picture through a second encoder: unfiltered rows, stored without compression. */
function reencode(file: Uint8Array): Uint8Array {
  const { width, height, rgba } = decodePng(file);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

describe('decodePng', () => {
  it('reads straight RGBA, transparent pixels included', async () => {
    const pixels = decodePng(await png('rgba(255, 0, 0, 1)'));
    expect([pixels.width, pixels.height]).toEqual([4, 2]);
    expect([...pixels.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...pixels.rgba.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it('counts the pixels that differ', async () => {
    const red = decodePng(await png('#f00'));
    const blue = decodePng(await png('#00f'));
    expect(differentPixels(red, red)).toBe(0);
    expect(differentPixels(red, blue)).toBe(4);
  });
});

describe('writeIfChanged', () => {
  let folder: string;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'lpc-output-'));
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('keeps an image whose pixels did not change, even when encoded differently', async () => {
    const original = await png('#f00');
    const reencoded = reencode(original);
    expect(Buffer.compare(Buffer.from(original), Buffer.from(reencoded))).not.toBe(0);
    writeFileSync(join(folder, 'walk.png'), original);
    const before = statSync(join(folder, 'walk.png')).mtimeMs;

    const written = writeIfChanged(folder, { file: 'walk.png', content: reencoded, kind: 'image' });

    expect(written).toBe(false);
    expect(statSync(join(folder, 'walk.png')).mtimeMs).toBe(before);
    expect(readFileSync(join(folder, 'walk.png'))).toEqual(Buffer.from(original));
  });

  it('writes an image whose pixels changed, and a file that did not exist', async () => {
    writeFileSync(join(folder, 'walk.png'), await png('#f00'));
    const blue = await png('#00f');
    expect(writeIfChanged(folder, { file: 'walk.png', content: blue, kind: 'image' })).toBe(true);
    expect(writeIfChanged(folder, { file: 'idle.png', content: blue, kind: 'image' })).toBe(true);
    expect(readFileSync(join(folder, 'walk.png'))).toEqual(Buffer.from(blue));
  });

  it('compares text byte by byte', () => {
    const text = new TextEncoder().encode('a,b\n');
    writeFileSync(join(folder, 'credits.csv'), text);
    expect(writeIfChanged(folder, { file: 'credits.csv', content: text, kind: 'text' })).toBe(
      false,
    );
    const other = new TextEncoder().encode('a,c\n');
    expect(writeIfChanged(folder, { file: 'credits.csv', content: other, kind: 'text' })).toBe(
      true,
    );
  });
});

describe('stableMetadata', () => {
  it('drops the export time and timings so a rebuild yields the same file', () => {
    const exported = (time: string, ms: number) =>
      JSON.stringify({ exportTimestamp: time, bodyType: 'female', performance: { totalMs: ms } });
    const first = stableMetadata(exported('2026-10-13T06-34-33', 5279));
    const second = stableMetadata(exported('2026-10-14T09-00-00', 4100));
    expect(first).toEqual(second);
    expect(JSON.parse(new TextDecoder().decode(first))).toEqual({ bodyType: 'female' });
  });
});
