import type { UiMemory } from './uiMemory';

const MEMORY_KEY = 'map.walkingNpcs';
const OFF = 'off';

type Listener = (isActive: boolean) => void;

/**
 * The "NPCs andando" switch: on by default, remembered on this device, and
 * forced off while the system asks for reduced motion.
 */
export class WalkingNpcsSetting {
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly memory: UiMemory,
    private readonly prefersReducedMotion: () => boolean,
  ) {}

  /** What the player chose, regardless of the system preference. */
  get isChosen(): boolean {
    return this.memory.get(MEMORY_KEY) !== OFF;
  }

  get isReducedMotion(): boolean {
    return this.prefersReducedMotion();
  }

  get isActive(): boolean {
    return this.isChosen && !this.isReducedMotion;
  }

  choose(isOn: boolean): void {
    this.memory.set(MEMORY_KEY, isOn ? 'on' : OFF);
    this.listeners.forEach((listener) => listener(this.isActive));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
