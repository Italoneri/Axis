import { stationTypeSchema, type StationType } from '../model/schema';

type Labeler = (n: string) => string;

const LABELS: Record<StationType, Labeler> = {
  alambique: (n) => `Alambique ${n}`,
  caldeirao: (n) => `Caldeirão ${n}`,
  circulo: (n) => `Círculo de transmutação ${n}`,
};

/** "Alambique 2", "Caldeirão 1": station ids are `<type>-<n>` (lab.json). Unknown ids show as they are. */
export function stationLabel(stationId: string): string {
  const [type, n = ''] = stationId.split('-');
  const parsed = stationTypeSchema.safeParse(type);
  return parsed.success ? LABELS[parsed.data](n) : stationId;
}
