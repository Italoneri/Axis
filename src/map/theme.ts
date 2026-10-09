import { z } from 'zod';

const unit = z.number().min(0).max(1);

/** Visual knobs of the generated map. Ranges here are also the slider ranges. */
export const themeSchema = z.object({
  /** Color the gold veins are painted with, before the glitter noise. */
  goldColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  floorVeins: unit,
  wallVeins: unit,
  /** Strength of the rotated copies of the vein mask; 0 keeps only the original veins. */
  veinCopies: unit,
  /** Degrees added to the hue of the blue disc. */
  discHueShift: z.number().min(-180).max(180),
  discBrightness: z.number().min(0.3).max(2),
  wallDesaturation: unit,
  /** 0 = neutral gray stone, 1 = the reference warm gray, up to 3 = sandy. */
  wallWarmth: z.number().min(0).max(3),
  /** Share of the map one repetition of the floor texture covers. */
  floorScale: z.number().min(0.1).max(1),
  innerShadow: unit,
  prismGlow: unit,
  prismPulseSeconds: z.number().min(0.5).max(10),
});

export type MapTheme = z.infer<typeof themeSchema>;
export type NumericThemeKey = {
  [K in keyof MapTheme]: MapTheme[K] extends number ? K : never;
}[keyof MapTheme];

export function parseTheme(raw: unknown): MapTheme {
  const result = themeSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid theme.json:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export function serializeTheme(theme: MapTheme): string {
  return `${JSON.stringify(theme, null, 2)}\n`;
}

type Listener = (theme: MapTheme) => void;

/**
 * Live working copy of theme.json for the master's "Visual do mapa" tab. Not
 * persisted: exporting the file and committing it to src/data is the save.
 */
export class ThemeStore {
  private theme: MapTheme;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly original: MapTheme) {
    this.theme = original;
  }

  get current(): MapTheme {
    return this.theme;
  }

  get isDirty(): boolean {
    return this.theme !== this.original;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setValue<K extends keyof MapTheme>(key: K, value: MapTheme[K]): void {
    const next = themeSchema.safeParse({ ...this.theme, [key]: value });
    if (!next.success) {
      console.warn('[theme] ignoring out-of-range value', z.prettifyError(next.error));
      return;
    }
    this.theme = next.data;
    this.notify();
  }

  reset(): void {
    this.theme = this.original;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.theme));
  }
}
