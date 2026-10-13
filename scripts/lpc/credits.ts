/**
 * LPC art is CC-BY-SA / GPL / OGA-BY: every drawn layer needs its authors and
 * licenses on the Credits screen.
 */
import { z } from 'zod';
import { parseCsv } from './csv';

const exportedCharacterSchema = z.object({
  layers: z.array(
    z.object({
      itemId: z.string(),
      source: z.object({ kind: z.string(), spritePath: z.string().optional() }),
    }),
  ),
  credits: z.array(
    z.object({
      file: z.string(),
      authors: z.array(z.string()),
      licenses: z.array(z.string()),
    }),
  ),
});
export type ExportedCharacter = z.infer<typeof exportedCharacterSchema>;

export function parseExportedCharacter(json: string): ExportedCharacter {
  return exportedCharacterSchema.parse(JSON.parse(json));
}

/** Sprite files drawn without a credit that names authors and licenses. */
export function uncreditedLayers({ layers, credits }: ExportedCharacter): string[] {
  const complete = credits.filter(
    (credit) => credit.authors.length > 0 && credit.licenses.length > 0,
  );
  return layers
    .flatMap((layer) => (layer.source.spritePath === undefined ? [] : [layer.source.spritePath]))
    .filter((path) => !complete.some((credit) => path.startsWith(`${credit.file}/`)));
}

/** Rows of a credits.csv (site format) missing authors or licenses. */
export function incompleteCreditRows(csv: string): string[] {
  const [header = [], ...rows] = parseCsv(csv);
  const column = (row: string[], title: string) => (row[header.indexOf(title)] ?? '').trim();
  return rows
    .filter((row) => column(row, 'authors') === '' || column(row, 'licenses') === '')
    .map((row) => column(row, 'filename'));
}
