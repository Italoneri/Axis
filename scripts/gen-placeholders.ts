/**
 * Generates placeholder PNGs for every building and resource listed in src/data.
 * Existing files are kept (they may already be final art); pass --force to overwrite.
 *
 *   npm run gen:placeholders [-- --force]
 */
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface Entity {
  id: string;
  name: string;
  icon: string;
  sprite?: string;
}

type Shape =
  'circle' | 'hexagon' | 'diamond' | 'octagon' | 'square' | 'pentagon' | 'triangle' | 'star';
const SHAPES: readonly Shape[] = [
  'star',
  'hexagon',
  'circle',
  'diamond',
  'octagon',
  'square',
  'pentagon',
  'triangle',
];

const GOLD = '#d4af37';
const SPRITE_SIZE = 256;
const ICON_SIZE = 64;

const root = join(import.meta.dirname, '..');
const force = process.argv.includes('--force');
const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(root, file), 'utf8')) as T;

const manifest = readJson<{ images: Record<string, string> }>('src/data/assets.json').images;
const buildings = readJson<Entity[]>('src/data/buildings.json');
const resources = readJson<Entity[]>('src/data/resources.json');

let written = 0;
buildings.forEach((b, i) => {
  const style = {
    shape: SHAPES[i % SHAPES.length] ?? 'circle',
    hue: (i * 360) / buildings.length,
    letter: initial(b.name),
  };
  if (b.sprite) writeAsset(b.sprite, SPRITE_SIZE, style);
  writeAsset(b.icon, ICON_SIZE, style);
});
resources.forEach((r, i) => {
  writeAsset(r.icon, ICON_SIZE, { shape: 'circle', hue: 45 + i * 90, letter: initial(r.name) });
});
console.log(
  `placeholders: ${written} written${force ? '' : ' (existing files kept; use --force to overwrite)'}`,
);

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function writeAsset(
  key: string,
  size: number,
  style: { shape: Shape; hue: number; letter: string },
): void {
  const relPath = manifest[key];
  if (!relPath) throw new Error(`asset key "${key}" missing from assets.json`);
  const file = join(root, 'public', relPath);
  if (existsSync(file) && !force) return;

  const canvas = createCanvas(size, size);
  drawPlaceholder(canvas.getContext('2d'), size, style);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, canvas.toBuffer('image/png'));
  written++;
}

function drawPlaceholder(
  ctx: SKRSContext2D,
  size: number,
  { shape, hue, letter }: { shape: Shape; hue: number; letter: string },
): void {
  const c = size / 2;
  const r = size * 0.42;
  const stroke = Math.max(2, size * 0.035);

  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.06;
  tracePath(ctx, shape, c, r);
  const fill = ctx.createRadialGradient(c, c * 0.8, r * 0.1, c, c, r);
  fill.addColorStop(0, `hsl(${hue} 45% 38%)`);
  fill.addColorStop(1, `hsl(${hue} 50% 14%)`);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = stroke;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  tracePath(ctx, shape, c, r - stroke * 2);
  ctx.lineWidth = stroke / 2;
  ctx.strokeStyle = 'rgba(212,175,55,0.45)';
  ctx.stroke();

  ctx.fillStyle = '#f3e3a6';
  ctx.font = `bold ${Math.round(size * 0.36)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, c, c + size * 0.02);
}

function tracePath(ctx: SKRSContext2D, shape: Shape, c: number, r: number): void {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(c, c, r, 0, Math.PI * 2);
    return;
  }
  const polygons: Record<Exclude<Shape, 'circle' | 'star'>, { sides: number; rotation: number }> = {
    hexagon: { sides: 6, rotation: 0 },
    diamond: { sides: 4, rotation: 0 },
    octagon: { sides: 8, rotation: Math.PI / 8 },
    square: { sides: 4, rotation: Math.PI / 4 },
    pentagon: { sides: 5, rotation: -Math.PI / 2 },
    triangle: { sides: 3, rotation: -Math.PI / 2 },
  };
  const points =
    shape === 'star'
      ? Array.from({ length: 16 }, (_, i) => ({
          angle: (i * Math.PI) / 8 - Math.PI / 2,
          radius: i % 2 === 0 ? r : r * 0.72,
        }))
      : Array.from({ length: polygons[shape].sides }, (_, i) => ({
          angle: polygons[shape].rotation + (i * 2 * Math.PI) / polygons[shape].sides,
          radius: shape === 'triangle' ? r * 1.1 : r,
        }));
  points.forEach(({ angle, radius }, i) => {
    const x = c + radius * Math.cos(angle);
    const y = c + radius * Math.sin(angle) + (shape === 'triangle' ? r * 0.15 : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}
