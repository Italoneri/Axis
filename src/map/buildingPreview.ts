export interface PreviewRequest {
  readonly buildingId: string;
  readonly level: number;
  readonly slotId: string;
}

type Listener = (preview: PreviewRequest | null) => void;

/**
 * A building shown on one slot for the master to check new art, without touching
 * the game state. Lives in memory only: a reload clears it.
 */
export class BuildingPreview {
  private value: PreviewRequest | null = null;
  private readonly listeners = new Set<Listener>();

  get current(): PreviewRequest | null {
    return this.value;
  }

  show(request: PreviewRequest): void {
    this.set(request);
  }

  clear(): void {
    this.set(null);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(value: PreviewRequest | null): void {
    this.value = value;
    this.listeners.forEach((listener) => listener(value));
  }
}
