/** Particle tints for building effects, kept free of Phaser so they can be unit-tested. */

export const DEFAULT_SMOKE_TINT = 0xcfc9c2;
export const DEFAULT_SPARK_TINTS: readonly number[] = [0xff7a1a, 0xffb347, 0xf3e3a6];

/** `#rrggbb` → 0xrrggbb. */
export function hexToTint(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Mixes a tint towards white; `amount` 0 keeps it, 1 is white. */
export function lighten(tint: number, amount: number): number {
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix((tint >> 16) & 0xff);
  const g = mix((tint >> 8) & 0xff);
  const b = mix(tint & 0xff);
  return (r << 16) | (g << 8) | b;
}

export function smokeTint(color?: string): number {
  return color ? hexToTint(color) : DEFAULT_SMOKE_TINT;
}

/** The base color plus two lighter shades, so sparks still read as hot and bright. */
export function sparkTints(color?: string): number[] {
  if (!color) return [...DEFAULT_SPARK_TINTS];
  const base = hexToTint(color);
  return [base, lighten(base, 0.35), lighten(base, 0.7)];
}
