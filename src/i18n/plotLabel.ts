import { plotTypeSchema, type PlotType } from '../model/schema';

type Labeler = (n: string) => string;

const LABELS: Record<PlotType, Labeler> = {
  canteiro: (n) => `Canteiro ${n}`,
  muda: (n) => `Muda ${n}`,
  estufa: (n) => `Bancada ${n}`,
  arcana: () => 'Bancada arcana',
  lago: () => 'Lago',
};

/** "Canteiro 1", "Bancada arcana": plot ids are `<type>-<n>` (garden.json). Unknown ids show as they are. */
export function plotLabel(plotId: string): string {
  const [type, n = ''] = plotId.split('-');
  const parsed = plotTypeSchema.safeParse(type);
  return parsed.success ? LABELS[parsed.data](n) : plotId;
}
