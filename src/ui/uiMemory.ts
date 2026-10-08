const STORAGE_KEY = 'axis-base-builder:ui';

/**
 * Form choices that should survive re-renders and reloads (last "De"/"Para",
 * last category picked…). Lives outside GameState: it is per device, never
 * saved with the game. Storage failures only cost the reload persistence.
 */
export class UiMemory {
  private values: Record<string, string>;

  constructor(private readonly storage: Storage | undefined) {
    this.values = this.load();
  }

  get(key: string): string | undefined {
    return this.values[key];
  }

  set(key: string, value: string): void {
    this.values = { ...this.values, [key]: value };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (error) {
      console.warn('[ui] could not remember form choice', error);
    }
  }

  /** The remembered value while it is still an option, otherwise the fallback. */
  pick(key: string, options: readonly string[], fallback: string): string {
    const remembered = this.values[key];
    return remembered !== undefined && options.includes(remembered) ? remembered : fallback;
  }

  private load(): Record<string, string> {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}');
      if (typeof parsed !== 'object' || parsed === null) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch (error) {
      console.warn('[ui] ignoring unreadable form memory', error);
      return {};
    }
  }
}
