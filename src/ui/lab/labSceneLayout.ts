import type { Brew } from '../../model/schema';
import { refHashKey } from '../../systems/Stock';
import { hash } from '../garden/sceneLayout';
import type { StationView } from './labViews';

/** The master's color, or a hue drawn from the potion (potions have no art of their own). */
export function liquidColor({ output, color }: Pick<Brew, 'output' | 'color'>): string {
  return color ?? `hsl(${hash(refHashKey(output)) % 360} 70% 55%)`;
}

export type BrewStage = 'idle' | 'simmer' | 'boil' | 'ready';

/** Simmers through the first half, boils through the second. */
export function brewStage(view: StationView): BrewStage {
  switch (view.kind) {
    case 'free':
      return 'idle';
    case 'ready':
      return 'ready';
    case 'brewing':
      return view.progress < 0.5 ? 'simmer' : 'boil';
  }
}

/** What changes a station's drawing: equal signatures leave the station alone (and its animations running). */
export function stationSignature(view: StationView): string {
  switch (view.kind) {
    case 'free':
      return 'free';
    case 'ready':
      return `ready|${liquidColor(view.brew)}|${view.brew.outputQty}|${view.potionName}`;
    case 'brewing':
      return `brewing|${liquidColor(view.brew)}|${view.daysLeft}|${Math.round(view.progress * 100)}|${view.potionName}`;
  }
}
