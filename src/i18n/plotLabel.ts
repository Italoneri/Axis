import { plotTypeSchema, type PlotType } from '../model/schema';

type Labeler = (n: string) => string;

const LABELS: Record<PlotType, Labeler> = {
  canteiro: (n) => `Canteiro ${n}`,
  muda: (n) => `Muda ${n}`,
  estufa: (n) => `Bandeja ${n}`,
  arcana: (n) => `Bacia arcana ${n}`,
  lago: (n) => `Lago ${n}`,
};

/** "Canteiro 1", "Bacia arcana 2": plot ids are `<type>-<n>` (garden.json). Unknown ids show as they are. */
export function plotLabel(plotId: string): string {
  const [type, n = ''] = plotId.split('-');
  const parsed = plotTypeSchema.safeParse(type);
  return parsed.success ? LABELS[parsed.data](n) : plotId;
}
