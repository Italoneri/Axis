import type Phaser from 'phaser';
import { toPixels } from '../map/geometry';
import type { SlotDef } from '../map/layout';
import type { GameState } from '../model/schema';
import { isOnDuty } from '../systems/Npcs';

/** Above the building art and its effects. */
const BADGE_DEPTH = 40;
const FONT_SHARE = 0.013;
/** More workers than this read as "+N" so the badge stays small. */
const MAX_INITIALS = 3;

/** Initials of the NPCs on duty at each slot, drawn over the building. */
export class WorkerBadges {
  private readonly badges = new Map<string, Phaser.GameObjects.Text>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly slots: readonly SlotDef[],
    private readonly mapSize: number,
  ) {}

  update(state: GameState): void {
    const bySlot = workerNamesBySlot(state);
    this.slots.forEach((slot) => {
      const label = initials(bySlot.get(slot.id) ?? []);
      const badge = this.badges.get(slot.id);
      if (!label) {
        badge?.setVisible(false);
        return;
      }
      (badge ?? this.create(slot)).setText(label).setVisible(true);
    });
  }

  private create(slot: SlotDef): Phaser.GameObjects.Text {
    const { x, y } = toPixels(slot, this.mapSize);
    const fontSize = Math.max(10, Math.round(this.mapSize * FONT_SHARE));
    const badge = this.scene.add
      .text(x, y, '', {
        fontFamily: 'Cinzel, serif',
        fontSize: `${fontSize}px`,
        color: '#f3d98b',
        backgroundColor: 'rgba(20, 16, 24, 0.75)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(BADGE_DEPTH);
    this.badges.set(slot.id, badge);
    return badge;
  }
}

export function workerNamesBySlot(state: GameState): Map<string, string[]> {
  return state.npcs.filter(isOnDuty).reduce((bySlot, npc) => {
    const names = [...(bySlot.get(npc.job.slotId) ?? []), npc.name];
    return new Map(bySlot).set(npc.job.slotId, names);
  }, new Map<string, string[]>());
}

/** "B·G", or "B·G·T +2" for crowded posts. */
export function initials(names: readonly string[]): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, MAX_INITIALS).map((name) => name.trim().charAt(0).toUpperCase());
  const extra = names.length - MAX_INITIALS;
  return shown.join('·') + (extra > 0 ? ` +${extra}` : '');
}
